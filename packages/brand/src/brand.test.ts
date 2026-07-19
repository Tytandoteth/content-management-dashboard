import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { noEmDash, hasEmDash } from "./copy.js";
import { logoDomainFor, logoUrlForTool, toolUrlFor } from "./logos.js";

describe("noEmDash / hasEmDash", () => {
  it("rewrites a spaced em/en dash to a comma", () => {
    expect(noEmDash("Postiz — the scheduler")).toBe("Postiz, the scheduler");
    expect(hasEmDash(noEmDash("fast, cheap—and local"))).toBe(false);
  });
  it("keeps numeric ranges as a hyphen", () => {
    expect(noEmDash("$50–100/mo")).toBe("$50-100/mo");
  });
  it("leaves clean copy and hyphens untouched", () => {
    expect(noEmDash("a well-made tool")).toBe("a well-made tool");
    expect(hasEmDash("a well-made tool")).toBe(false);
  });
});

describe("logo resolution", () => {
  it("maps a known tool to its domain, homepage, and logo URL", () => {
    expect(logoDomainFor("Opus Clips")).toBe("opus.pro");
    expect(toolUrlFor("Opus Clips")).toBe("https://opus.pro");
    expect(logoUrlForTool("Opus Clips")).toContain("opus.pro");
  });
  it("passes a raw domain through untouched", () => {
    expect(logoDomainFor("example.com")).toBe("example.com");
  });
  it("returns null when it can't confidently map a name", () => {
    expect(logoDomainFor("zzz-not-a-real-tool")).toBeNull();
    expect(toolUrlFor(undefined)).toBeNull();
  });
});

describe("configurable brand identity", () => {
  // brand.ts reads process.env at module init, so overrides are exercised by
  // clearing/setting the vars and importing a fresh copy of the module.
  const BRAND_KEYS = [
    "BRAND_HANDLE",
    "BRAND_DISPLAY_NAME",
    "BRAND_TIKTOK_URL",
    "BRAND_X_HANDLE",
    "BRAND_X_URL",
    "BRAND_CTA_URL",
    "BRAND_CTA_LABEL",
    "BRAND_TAGLINE",
    "BRAND_PRIMARY_COLOR",
    "BRAND_SECONDARY_COLOR",
    "BRAND_ACCENT_COLOR",
    "BRAND_VOICE_PERSONA",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of BRAND_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of BRAND_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  it("falls back to neutral defaults that carry no personal brand data", async () => {
    const { BRAND_IDENTITY, BRAND_COLORS, BRAND_VOICE } = await import("./brand.js");
    expect(BRAND_IDENTITY.handle).toBe("@yourhandle");
    expect(BRAND_IDENTITY.displayName).toBe("Your Brand");
    expect(BRAND_IDENTITY.ctaUrl).toBe("https://example.com/links");
    expect(BRAND_IDENTITY.ctaLabel).toBe("Link in bio");
    // Palette default is preserved (a good-looking neutral orange, not PII).
    expect(BRAND_COLORS.primary).toBe("#ff7a1a");
    // The AI-tools persona is the shipped default when unset.
    expect(BRAND_VOICE.persona).toContain("AI-tools creator");
    // Guard: no personal handles/links leak through the defaults. The needles are
    // assembled from fragments so this guard file itself stays free of the raw
    // brand literals (keeps the repo-wide survivor grep clean).
    const blob = `${JSON.stringify(BRAND_IDENTITY)} ${BRAND_VOICE.persona}`.toLowerCase();
    for (const leak of ["ty" + ".prompts", "beacons" + ".ai"]) {
      expect(blob).not.toContain(leak.toLowerCase());
    }
  });

  it("reads every BRAND_* override at module init", async () => {
    process.env.BRAND_HANDLE = "@acme";
    process.env.BRAND_DISPLAY_NAME = "Acme Labs";
    process.env.BRAND_TIKTOK_URL = "https://www.tiktok.com/@acme";
    process.env.BRAND_X_HANDLE = "@acmehq";
    process.env.BRAND_X_URL = "https://x.com/acmehq";
    process.env.BRAND_CTA_URL = "https://acme.example/links";
    process.env.BRAND_CTA_LABEL = "Grab the kit";
    process.env.BRAND_TAGLINE = "Ship faster.";
    process.env.BRAND_PRIMARY_COLOR = "#123456";
    process.env.BRAND_SECONDARY_COLOR = "#abcdef";
    process.env.BRAND_ACCENT_COLOR = "#0f0f0f";
    process.env.BRAND_VOICE_PERSONA = "A calm, precise brand voice.";
    const { BRAND_IDENTITY, BRAND_COLORS, BRAND_VOICE } = await import("./brand.js");
    expect(BRAND_IDENTITY).toMatchObject({
      handle: "@acme",
      displayName: "Acme Labs",
      tiktokUrl: "https://www.tiktok.com/@acme",
      xHandle: "@acmehq",
      xUrl: "https://x.com/acmehq",
      ctaUrl: "https://acme.example/links",
      ctaLabel: "Grab the kit",
      tagline: "Ship faster.",
    });
    expect(BRAND_COLORS.primary).toBe("#123456");
    expect(BRAND_COLORS.secondary).toBe("#abcdef");
    expect(BRAND_COLORS.accent).toBe("#0f0f0f");
    expect(BRAND_VOICE.persona).toBe("A calm, precise brand voice.");
  });

  it("ignores blank/whitespace overrides and keeps the default", async () => {
    process.env.BRAND_HANDLE = "   ";
    const { BRAND_IDENTITY } = await import("./brand.js");
    expect(BRAND_IDENTITY.handle).toBe("@yourhandle");
  });
});
