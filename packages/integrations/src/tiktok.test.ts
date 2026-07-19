import { describe, it, expect } from "vitest";
import { TikTokClient } from "./tiktok.js";

type Captured = { url: string; init: RequestInit };

function stubFetch(captured: Captured[], response: unknown, ok = true): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return { ok, json: async () => response } as Response;
  }) as unknown as typeof fetch;
}

describe("TikTokClient", () => {
  it("buildAuthorizeUrl includes client_key, scope, redirect, and state", () => {
    const c = new TikTokClient({ clientKey: "ck", clientSecret: "cs" });
    const url = c.buildAuthorizeUrl({ redirectUri: "https://x/cb", state: "st" });
    expect(url).toContain("client_key=ck");
    expect(url).toContain("scope=video.upload");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fx%2Fcb");
    expect(url).toContain("state=st");
  });

  it("postPhotoDraft sends PHOTO + MEDIA_UPLOAD + PULL_FROM_URL and returns publishId", async () => {
    const captured: Captured[] = [];
    const c = new TikTokClient({
      clientKey: "ck",
      clientSecret: "cs",
      fetchImpl: stubFetch(captured, { data: { publish_id: "pub_1" }, error: { code: "ok" } }),
    });
    const r = await c.postPhotoDraft({ accessToken: "tok", title: "hi", imageUrls: ["https://a/1.png", "https://a/2.png"] });
    expect(r.publishId).toBe("pub_1");

    const body = JSON.parse(String(captured[0]!.init.body));
    expect(body.media_type).toBe("PHOTO");
    expect(body.post_mode).toBe("MEDIA_UPLOAD");
    expect(body.source_info.source).toBe("PULL_FROM_URL");
    expect(body.source_info.photo_images).toHaveLength(2);
    expect(body.source_info.photo_cover_index).toBe(0);
    expect((captured[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("postPhotoDraft throws on a TikTok error payload", async () => {
    const c = new TikTokClient({
      clientKey: "ck",
      clientSecret: "cs",
      fetchImpl: stubFetch(captured(), { error: { code: "rate_limit_exceeded", message: "slow down" } }, false),
    });
    await expect(c.postPhotoDraft({ accessToken: "t", title: "x", imageUrls: ["https://a/1.png"] })).rejects.toThrow(/slow down/);
  });

  it("exchangeCode posts a form-encoded auth-code grant and parses tokens", async () => {
    const cap: Captured[] = [];
    const c = new TikTokClient({
      clientKey: "ck",
      clientSecret: "cs",
      fetchImpl: stubFetch(cap, {
        access_token: "at",
        refresh_token: "rt",
        expires_in: 86400,
        refresh_expires_in: 1000,
        open_id: "oid",
        scope: "video.upload",
      }),
    });
    const t = await c.exchangeCode({ code: "code", redirectUri: "https://x/cb" });
    expect(t.accessToken).toBe("at");
    expect(t.openId).toBe("oid");
    expect(String(cap[0]!.init.body)).toContain("grant_type=authorization_code");
  });
});

function captured(): Captured[] {
  return [];
}
