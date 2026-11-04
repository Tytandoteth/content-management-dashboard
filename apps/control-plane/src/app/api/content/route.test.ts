import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createContent = vi.fn(async (input: unknown) => ({ id: "item-1", ...(input as object) }));

vi.mock("@cmd/db", () => ({ prisma: {} }));
vi.mock("@/lib/content-service", () => ({ createContent: (input: unknown) => createContent(input) }));

import { POST } from "./route.js";

const HOST = "abc123def.public.blob.vercel-storage.com";

function post(assetUrls: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/content", {
      method: "POST",
      body: JSON.stringify({ type: "tweet", title: "t", ...(assetUrls === undefined ? {} : { assetUrls }) }),
    }),
  );
}

describe("POST /api/content assetUrls", () => {
  beforeEach(() => {
    createContent.mockClear();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_ABC123def_notarealsecret");
    vi.stubEnv("CAROUSEL_PUBLIC_DIR", "/tmp/carousels");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [["/carousels/../../etc/passwd"]],
    [["http://169.254.169.254/latest/meta-data/"]],
    [["https://example.com/a.png"]],
    [[`https://${HOST}/a.png`, "http://localhost:3000/"]], // one bad value spoils the list
    [[42]],
    ["/carousels/a.png"], // not a list
  ])("refuses %j without creating anything", async (assetUrls) => {
    const res = await post(assetUrls);
    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });

  it("stores URLs from our own storage", async () => {
    const urls = [`https://${HOST}/uploads/cut.mp4`, "/carousels/item-1/slide-01.png"];
    const res = await post(urls);
    expect(res.status).toBe(201);
    expect(createContent).toHaveBeenCalledWith(expect.objectContaining({ assetUrls: urls }));
  });

  it.each([[undefined], [null]])("treats %j as no assets", async (assetUrls) => {
    const res = await post(assetUrls);
    expect(res.status).toBe(201);
    expect(createContent).toHaveBeenCalledWith(expect.objectContaining({ assetUrls: undefined }));
  });
});
