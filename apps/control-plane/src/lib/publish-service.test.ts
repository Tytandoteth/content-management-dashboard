import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostizClient } from "@cmd/integrations";
import { PublishConfigError, publishItem } from "./publish-service.js";

function fakeClient(postId = "post_abc") {
  return {
    schedulePost: vi.fn().mockResolvedValue({ postId, raw: {} }),
  } as unknown as PostizClient & { schedulePost: ReturnType<typeof vi.fn> };
}

/** A client wired like the REAL shared Postiz account: channels for several
 * different brands all connected at once. Used to prove an unresolved target
 * never fans out across them — this is the exact shape of the incident where
 * an untargeted publish landed on five unrelated brands' live accounts. */
function multiTenantClient(postId = "post_abc") {
  return {
    listChannels: vi.fn().mockResolvedValue([
      { id: "acme_x", disabled: false },
      { id: "acme_linkedin", disabled: false },
      { id: "globex_x", disabled: false },
      { id: "other_x", disabled: false },
      { id: "acme_fb", disabled: false },
    ]),
    schedulePost: vi.fn().mockResolvedValue({ postId, raw: {} }),
  } as unknown as PostizClient & { listChannels: ReturnType<typeof vi.fn>; schedulePost: ReturnType<typeof vi.fn> };
}

const baseItem = {
  id: "ci_1",
  title: "fallback title",
  assetUrls: ["https://cdn/x.png"],
  scheduledAt: new Date("2026-06-10T12:00:00.000Z"),
};

describe("publishItem", () => {
  it("maps payload to a Postiz schedule call and returns the post id", async () => {
    const client = fakeClient("post_xyz");
    const out = await publishItem(
      {
        ...baseItem,
        payload: {
          integrationIds: ["ch_1", "ch_2"],
          content: "the caption",
          platforms: ["x", "linkedin"],
        },
      },
      client,
    );

    expect(out).toEqual({
      postizPostId: "post_xyz",
      platforms: ["x", "linkedin"],
      releaseUrl: undefined,
      posts: [{ postId: "post_xyz", provider: "tiktok", integrationIds: ["ch_1", "ch_2"] }],
      failures: [],
      skipped: [],
    });
    expect(client.schedulePost).toHaveBeenCalledWith({
      integrationIds: ["ch_1", "ch_2"],
      content: "the caption",
      title: "fallback title",
      thread: [],
      mediaUrls: ["https://cdn/x.png"],
      scheduledAt: "2026-06-10T12:00:00.000Z",
      stripXLinks: true,
    });
  });

  it("passes payload.thread through to schedulePost", async () => {
    const client = fakeClient();
    await publishItem(
      {
        ...baseItem,
        payload: {
          integrationIds: ["ch_1"],
          content: "main",
          thread: ["📰 Full breakdown: https://example.com/news/x", "", 5 as unknown as string],
        },
      },
      client,
    );
    // Only the valid string reply survives.
    expect(client.schedulePost.mock.calls[0]![0].thread).toEqual([
      "📰 Full breakdown: https://example.com/news/x",
    ]);
  });

  it("falls back to the title when no content is set", async () => {
    const client = fakeClient();
    await publishItem({ ...baseItem, payload: { integrationIds: ["ch_1"] } }, client);
    expect(client.schedulePost.mock.calls[0]![0].content).toBe("fallback title");
  });

  it("refuses to publish without target channels", async () => {
    await expect(
      publishItem({ ...baseItem, payload: {} }, fakeClient()),
    ).rejects.toBeInstanceOf(PublishConfigError);
  });

  describe("multi-brand safety (regression: never fan out to every connected channel)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("refuses to publish to a brand with no configured channel, even when OTHER brands' channels are connected", async () => {
      const client = multiTenantClient();
      await expect(
        publishItem({ ...baseItem, payload: {}, brandSurface: "acme" }, client),
      ).rejects.toBeInstanceOf(PublishConfigError);
      // The critical assertion: it must never even ask what's connected, let
      // alone publish to it. A brand with nothing configured gets nothing.
      expect(client.listChannels).not.toHaveBeenCalled();
      expect(client.schedulePost).not.toHaveBeenCalled();
    });

    it("publishes ONLY to the item's own brand's configured channels, ignoring other brands' connected channels", async () => {
      vi.stubEnv("POSTIZ_CHANNELS_ACME", "acme_tiktok");
      const client = multiTenantClient("post_acme");
      const out = await publishItem(
        { ...baseItem, payload: { content: "acme carousel" }, brandSurface: "acme" },
        client,
      );
      expect(client.schedulePost).toHaveBeenCalledWith(
        expect.objectContaining({ integrationIds: ["acme_tiktok"] }),
      );
      expect(out.posts[0]!.integrationIds).toEqual(["acme_tiktok"]);
      // Never touched the other brands' channels or the "list everything" path.
      expect(client.listChannels).not.toHaveBeenCalled();
    });

    it("a different brand's item resolves to ITS OWN channels, not acme's", async () => {
      vi.stubEnv("POSTIZ_CHANNELS_ACME", "acme_tiktok");
      vi.stubEnv("POSTIZ_CHANNELS_GLOBEX", "globex_x,globex_linkedin");
      const client = multiTenantClient("post_globex");
      await publishItem(
        { ...baseItem, payload: { content: "globex post" }, brandSurface: "globex" },
        client,
      );
      expect(client.schedulePost).toHaveBeenCalledWith(
        expect.objectContaining({ integrationIds: ["globex_x", "globex_linkedin"] }),
      );
    });
  });
});
