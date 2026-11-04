import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blobAssetUrl, isStorableAssetUrl, localAssetPath } from "./asset-urls.js";
import { readSlideAsset } from "./store.js";

const HOST = "abc123def.public.blob.vercel-storage.com";
const SLIDE = `https://${HOST}/carousels/item-1/slide-01.png`;

/** Every one of these must never reach the network or the disk. */
const INTERNAL_URLS = [
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://localhost:3000/api/health",
  "http://127.0.0.1:5432/",
  "http://[::1]/",
  "http://10.0.0.1/",
  "https://example.com/slide.png",
  // Our host in the wrong place.
  `http://${HOST}/carousels/a.png`,
  `https://${HOST}.evil.example/a.png`,
  `https://${HOST}@evil.example/a.png`,
  `https://evil.example/${HOST}/a.png`,
  `https://user:pass@${HOST}/a.png`,
  `https://${HOST}:8443/a.png`,
  // Somebody else's Blob store.
  "https://otherstore.public.blob.vercel-storage.com/a.png",
  "file:///etc/passwd",
];

const TRAVERSALS = [
  "/carousels/../secret.txt",
  "/carousels/../../../../../../etc/passwd",
  "/carousels/item-1/../../secret.txt",
  "/carousels/../carousels-backup/secret.txt", // shares the carousel dir's name as a prefix
  "/carousels//etc/passwd",
  "/carousels/..",
  "/carousels/.",
  "/carousels/item-1\0/../../secret.txt",
];

describe("slide asset containment", () => {
  let base: string;
  let root: string;
  const fetchMock = vi.fn();

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "asset-urls-"));
    root = join(base, "carousels");
    mkdirSync(join(root, "item-1"), { recursive: true });
    mkdirSync(join(base, "carousels-backup"));
    writeFileSync(join(root, "item-1", "slide-01.png"), "slide");
    writeFileSync(join(base, "secret.txt"), "secret");
    writeFileSync(join(base, "carousels-backup", "secret.txt"), "secret");
    vi.stubEnv("CAROUSEL_PUBLIC_DIR", root);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_ABC123def_notarealsecret");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(base, { recursive: true, force: true });
  });

  describe("readSlideAsset", () => {
    it("reads a slide inside the carousel dir", async () => {
      const buf = await readSlideAsset("/carousels/item-1/slide-01.png");
      expect(buf?.toString()).toBe("slide");
    });

    it("keeps a path inside the dir when it wanders but stays in", async () => {
      const buf = await readSlideAsset("/carousels/item-1/../item-1/slide-01.png");
      expect(buf?.toString()).toBe("slide");
    });

    it.each(TRAVERSALS)("refuses the traversal %j", async (url) => {
      expect(await readSlideAsset(url)).toBeNull();
    });

    it("fetches from our Blob store and refuses to follow redirects", async () => {
      fetchMock.mockResolvedValue(new Response("remote"));
      const buf = await readSlideAsset(SLIDE);
      expect(buf?.toString()).toBe("remote");
      expect(fetchMock).toHaveBeenCalledWith(SLIDE, { redirect: "error" });
    });

    it("treats a failed Blob fetch as a missing slide", async () => {
      fetchMock.mockRejectedValue(new TypeError("unexpected redirect"));
      expect(await readSlideAsset(SLIDE)).toBeNull();
    });

    it.each(INTERNAL_URLS)("never fetches %s", async (url) => {
      expect(await readSlideAsset(url)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches nothing when no Blob store is configured", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
      expect(await readSlideAsset(SLIDE)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("localAssetPath / blobAssetUrl", () => {
    it("resolves only inside the carousel dir", () => {
      expect(localAssetPath("/carousels/item-1/slide-01.png")).toBe(join(root, "item-1", "slide-01.png"));
      for (const url of TRAVERSALS) expect(localAssetPath(url)).toBeNull();
    });

    it("lowercases the store id from the token to match the hostname", () => {
      expect(blobAssetUrl(SLIDE)).toBe(SLIDE);
      expect(blobAssetUrl(SLIDE.replace(HOST, HOST.toUpperCase()))).toBe(SLIDE);
    });

    it("ignores a token with no store id", () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "not-a-blob-token");
      expect(blobAssetUrl(SLIDE)).toBeNull();
    });
  });

  describe("isStorableAssetUrl", () => {
    it("accepts what our storage writes", () => {
      expect(isStorableAssetUrl("/carousels/item-1/slide-01.png")).toBe(true);
      expect(isStorableAssetUrl(SLIDE)).toBe(true);
      expect(isStorableAssetUrl(`https://${HOST}/uploads/cut-x8Yz.mp4`)).toBe(true);
    });

    it.each([...TRAVERSALS, ...INTERNAL_URLS])("refuses %j", (url) => {
      expect(isStorableAssetUrl(url)).toBe(false);
    });

    it.each([
      "/carousels/%2e%2e/%2e%2e/etc/passwd",
      "/carousels/..%2f..%2fetc/passwd",
      "/etc/passwd",
      "/api/health",
      "relative/slide.png",
      "",
      42,
      null,
      {},
      ["/carousels/a.png"],
      `https://${HOST}/${"a".repeat(2100)}`,
    ])("refuses the malformed value %j", (url) => {
      expect(isStorableAssetUrl(url)).toBe(false);
    });
  });
});
