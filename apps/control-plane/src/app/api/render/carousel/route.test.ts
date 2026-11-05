import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const renderAndStore = vi.fn(async () => ({ files: ["/carousels/x/slide-01.jpg"], dir: "x" }));

vi.mock("@/lib/carousel/store", () => ({ renderAndStore: (...args: unknown[]) => renderAndStore(...(args as [])) }));
vi.mock("@/lib/carousel/compose", () => ({ composeSpec: vi.fn() }));

import { POST } from "./route.js";

function post(slide: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("http://localhost/api/render/carousel", {
      method: "POST",
      body: JSON.stringify({ spec: { caption: "", hashtags: [], slides: [{ role: "hook", headline: "h", ...slide }] } }),
    }),
  );
}

describe("POST /api/render/carousel image references", () => {
  beforeEach(() => {
    renderAndStore.mockClear();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_ABC123def_notarealsecret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [{ bgImageUrl: "http://169.254.169.254/latest/meta-data/" }, "slides[0].bgImageUrl"],
    [{ card: { avatarUrl: "http://10.0.0.1/" } }, "slides[0].card.avatarUrl"],
    [{ bgImageUrl: "https://example.com/a.png" }, "slides[0].bgImageUrl"],
  ])("refuses %j before rendering anything", async (slide, path) => {
    const res = await post(slide);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(path);
    expect(renderAndStore).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ bgImageUrl: "data:image/png;base64,AAAA" }],
    [{ bgImageUrl: "https://abc123def.public.blob.vercel-storage.com/carousels/a/slide-01.png" }],
    [{ card: { avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4&s=200" } }],
  ])("renders %j", async (slide) => {
    const res = await post(slide);
    expect(res.status).toBe(201);
    expect(renderAndStore).toHaveBeenCalledOnce();
  });
});
