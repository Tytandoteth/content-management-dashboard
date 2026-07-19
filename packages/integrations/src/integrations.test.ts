import { describe, expect, it, vi } from "vitest";
import { PostizApiError, PostizClient } from "./postiz.js";
import { N8nDispatcher } from "./n8n.js";
import type { ContentApprovedEvent } from "@cmd/contracts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PostizClient.schedulePost", () => {
  it("resolves provider settings and posts the full CreatePostDto shape", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes("/integrations")
        ? jsonResponse([{ id: "ch_1", identifier: "x" }])
        : jsonResponse([{ id: "post_123", releaseURL: "https://x.com/acct/status/1" }]),
    );
    const client = new PostizClient({
      baseUrl: "https://post.example.com/api/",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.schedulePost({
      integrationIds: ["ch_1"],
      content: "gm",
      scheduledAt: "2026-06-05T12:00:00.000Z",
    });

    expect(result.postId).toBe("post_123");
    expect(result.releaseUrl).toBe("https://x.com/acct/status/1");
    const postCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))!;
    const sent = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(sent.type).toBe("schedule");
    expect(sent.shortLink).toBe(false);
    expect(sent.tags).toEqual([]);
    expect(sent.date).toBe("2026-06-05T12:00:00.000Z");
    expect(sent.posts[0].integration.id).toBe("ch_1");
    expect(sent.posts[0].settings).toMatchObject({ __type: "x", who_can_reply_post: "everyone" });
  });

  it("always sends a date, even for publish-now", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes("/integrations")
        ? jsonResponse([{ id: "ch_1", identifier: "x" }])
        : jsonResponse([{ id: "post_9" }]),
    );
    const client = new PostizClient({ baseUrl: "https://p/api", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.schedulePost({ integrationIds: ["ch_1"], content: "now post" });
    const postCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))!;
    const sent = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(sent.type).toBe("now");
    expect(typeof sent.date).toBe("string");
    expect(sent.date.length).toBeGreaterThan(10);
  });

  it("uploads media and builds a thread (main + reply) on the post", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/public/v1/integrations")) return jsonResponse([{ id: "ch_1", identifier: "x" }]);
      if (u.includes("cdn.example.com")) {
        // the external media fetch
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (u.endsWith("/public/v1/upload")) {
        return jsonResponse({ id: "media_1", path: "https://uploads.postiz.com/abc.png" }, 201);
      }
      return jsonResponse([{ id: "post_777", releaseURL: "https://x.com/a/status/777" }]);
    });
    const client = new PostizClient({
      baseUrl: "https://post.example.com/api",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.schedulePost({
      integrationIds: ["ch_1"],
      content: "main tweet",
      thread: ["📰 Full breakdown: https://example.com/news/x"],
      mediaUrls: ["https://cdn.example.com/news.png"],
    });

    expect(result.postId).toBe("post_777");

    // The upload endpoint was called with multipart.
    const uploadCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/upload"))!;
    expect(uploadCall).toBeTruthy();
    expect((uploadCall[1] as RequestInit).headers).toMatchObject({
      "content-type": expect.stringContaining("multipart/form-data"),
    });

    const postCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))!;
    const sent = JSON.parse((postCall[1] as RequestInit).body as string);
    const value = sent.posts[0].value;
    expect(value).toHaveLength(2); // main + 1 reply
    expect(value[0].content).toBe("main tweet");
    expect(value[0].image).toEqual([{ id: "media_1", path: "https://uploads.postiz.com/abc.png" }]);
    expect(value[1].content).toContain("Full breakdown");
    expect(value[1].image).toEqual([]); // reply has no media
  });

  it("attaches per-reply media via threadMedia (image-per-tweet)", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/public/v1/integrations")) return jsonResponse([{ id: "ch_1", identifier: "x" }]);
      if (u.includes("cdn.example.com")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
      }
      if (u.endsWith("/public/v1/upload")) {
        return jsonResponse({ id: "media_x", path: "https://uploads.postiz.com/x.png" }, 201);
      }
      return jsonResponse([{ id: "post_778" }]);
    });
    const client = new PostizClient({
      baseUrl: "https://post.example.com/api",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.schedulePost({
      integrationIds: ["ch_1"],
      content: "1. CogVideoX",
      thread: ["2. AnimateDiff", "3. SkyReels-V2"],
      mediaUrls: ["https://cdn.example.com/cover.png"],
      threadMedia: [["https://cdn.example.com/r1.png"], ["https://cdn.example.com/r2.png"]],
    });

    const postCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))!;
    const value = JSON.parse((postCall[1] as RequestInit).body as string).posts[0].value;
    expect(value).toHaveLength(3); // lead + 2 replies
    // Every tweet (lead and both replies) carries exactly one image.
    expect(value[0].image).toHaveLength(1);
    expect(value[1].image).toHaveLength(1);
    expect(value[2].image).toHaveLength(1);
  });

  it("drops link-only replies for X when stripXLinks is set, keeps them otherwise", async () => {
    const mkFetch = () =>
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/public/v1/integrations"))
          return jsonResponse([
            { id: "x_1", identifier: "x" },
            { id: "li_1", identifier: "linkedin-page" },
          ]);
        return jsonResponse([{ id: "p" }]);
      });

    // stripXLinks ON: X drops the link reply, LinkedIn keeps it.
    let fetchImpl = mkFetch();
    let client = new PostizClient({ baseUrl: "https://p/api", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.schedulePost({
      integrationIds: ["x_1", "li_1"],
      content: "main",
      thread: ["📰 Full breakdown 👇\nhttps://example.com/news/x"],
      stripXLinks: true,
    });
    let sent = JSON.parse((fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))![1] as RequestInit).body as string);
    const xPost = sent.posts.find((p: { settings: { __type: string } }) => p.settings.__type === "x");
    const liPost = sent.posts.find((p: { settings: { __type: string } }) => p.settings.__type === "linkedin-page");
    expect(xPost.value).toHaveLength(1); // reply dropped for X
    expect(liPost.value).toHaveLength(2); // reply kept for LinkedIn

    // stripXLinks OFF (e.g. self-hosted): X keeps the link reply.
    fetchImpl = mkFetch();
    client = new PostizClient({ baseUrl: "https://p/api", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.schedulePost({
      integrationIds: ["x_1"],
      content: "main",
      thread: ["📰 Full breakdown 👇\nhttps://example.com/news/x"],
      stripXLinks: false,
    });
    sent = JSON.parse((fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))![1] as RequestInit).body as string);
    expect(sent.posts[0].value).toHaveLength(2); // reply kept
  });

  it("publishes text-only when a media upload fails (non-fatal)", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/public/v1/integrations")) return jsonResponse([{ id: "ch_1", identifier: "x" }]);
      if (u.includes("cdn.example.com")) return new Response("nope", { status: 404 });
      return jsonResponse([{ id: "post_ok" }]);
    });
    const client = new PostizClient({ baseUrl: "https://p/api", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.schedulePost({
      integrationIds: ["ch_1"],
      content: "still goes out",
      mediaUrls: ["https://cdn.example.com/broken.png"],
    });
    expect(result.postId).toBe("post_ok");
    const postCall = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/public/v1/posts"))!;
    const sent = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(sent.posts[0].value[0].image).toEqual([]); // image dropped, post still sent
  });

  it("throws PostizApiError on non-2xx", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes("/integrations")
        ? jsonResponse([{ id: "ch_1", identifier: "x" }])
        : jsonResponse({ error: "nope" }, 401),
    );
    const client = new PostizClient({
      baseUrl: "https://post.example.com/api",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.schedulePost({ integrationIds: ["ch_1"], content: "x" }),
    ).rejects.toBeInstanceOf(PostizApiError);
  });
});

describe("N8nDispatcher", () => {
  it("maps dotted event types to kebab webhook paths", () => {
    const d = new N8nDispatcher({ webhookBaseUrl: "https://flows.example.com/webhook" });
    expect(d.pathFor("content.approved")).toBe("/content-approved");
    expect(d.pathFor("metrics.updated")).toBe("/metrics-updated");
  });

  it("delivers events and includes the signature header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const d = new N8nDispatcher({
      webhookBaseUrl: "https://flows.example.com/webhook",
      signingToken: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const event: ContentApprovedEvent = {
      id: "evt_1",
      type: "content.approved",
      contentItemId: "ci_1",
      payload: { approvedBy: "ryan", scheduledAt: null },
      occurredAt: "2026-06-04T00:00:00.000Z",
    };
    await d.dispatch(event);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://flows.example.com/webhook/content-approved");
    expect((init as RequestInit).headers).toMatchObject({
      "x-cmd-signature": "secret",
    });
  });
});
