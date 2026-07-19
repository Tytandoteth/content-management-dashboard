import { describe, expect, it } from "vitest";
import { evaluateModeration } from "./moderation.js";

const ctx = { brandSurface: "default" as const, to: "approved" as const };

describe("moderation — organic content is untouched", () => {
  it("leaves non-paid payloads alone", () => {
    const payload = { content: "gm check https://example.com" };
    const r = evaluateModeration(payload, ctx);
    expect(r.ok).toBe(true);
    expect(r.payload).toBe(payload); // same reference, no mutation
    expect(r.taggedUrls).toHaveLength(0);
  });

  it("does not run on non-approve/publish transitions", () => {
    const payload = { paid: true, content: "see https://example.com" };
    const r = evaluateModeration(payload, { ...ctx, to: "in_review" });
    expect(r.ok).toBe(true);
    expect(r.taggedUrls).toHaveLength(0);
  });
});

describe("moderation — paid content is auto-tagged with UTMs", () => {
  it("tags an untagged link in the content string", () => {
    const r = evaluateModeration(
      { paid: true, content: "Try this: https://example.com/signup" },
      ctx,
    );
    expect(r.ok).toBe(true);
    const url = new URL((r.payload.content as string).match(/https?:\/\/\S+/)![0]);
    expect(url.searchParams.get("utm_source")).toBe("default");
    expect(url.searchParams.get("utm_medium")).toBe("paid_social");
    expect(url.searchParams.get("utm_campaign")).toBe("content_engine");
  });

  it("uses payload.campaign for utm_campaign when present", () => {
    const r = evaluateModeration(
      { paid: true, campaign: "summer_launch", links: ["https://example.com"] },
      ctx,
    );
    const url = new URL((r.payload.links as string[])[0]!);
    expect(url.searchParams.get("utm_campaign")).toBe("summer_launch");
  });

  it("never overwrites an existing UTM value", () => {
    const r = evaluateModeration(
      { paid: true, links: ["https://example.com/?utm_source=partner"] },
      ctx,
    );
    const url = new URL((r.payload.links as string[])[0]!);
    expect(url.searchParams.get("utm_source")).toBe("partner"); // preserved
    expect(url.searchParams.get("utm_medium")).toBe("paid_social"); // added
  });

  it("preserves trailing punctuation after a tagged URL", () => {
    const r = evaluateModeration(
      { paid: true, content: "Go to https://example.com." },
      ctx,
    );
    expect(r.payload.content as string).toMatch(/\.$/);
    expect(r.payload.content as string).toContain("utm_source=default");
  });
});

describe("moderation — blocks what it cannot fix", () => {
  it("refuses paid content with an unparseable link", () => {
    const r = evaluateModeration(
      { paid: true, links: ["not a url"] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.code).toBe("unparseable_url");
  });

  it("allows paid content with no links at all", () => {
    const r = evaluateModeration({ paid: true, content: "just text" }, ctx);
    expect(r.ok).toBe(true);
  });
});
