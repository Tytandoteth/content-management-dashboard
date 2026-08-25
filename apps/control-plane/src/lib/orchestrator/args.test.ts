import { describe, expect, it } from "vitest";
import {
  clampStepCount,
  validateGenerateArgs,
  validateRecipeArgs,
  MAX_CAROUSEL_STEP_COUNT,
  MAX_STEP_COUNT,
} from "./args.js";

/**
 * Everything here is an argument object a planner LLM could plausibly emit. The
 * point of each case is that a bad value fails ITS step with a readable message
 * instead of reaching Prisma (or the generators) and throwing something raw.
 */

describe("clampStepCount", () => {
  it("keeps a sane count", () => {
    expect(clampStepCount(3)).toBe(3);
  });

  it("rejects non-numbers so the caller can default", () => {
    expect(clampStepCount("8")).toBeUndefined();
    expect(clampStepCount(null)).toBeUndefined();
    expect(clampStepCount(undefined)).toBeUndefined();
    expect(clampStepCount(NaN)).toBeUndefined();
    expect(clampStepCount(Infinity)).toBeUndefined();
  });

  it("clamps to the 1..10 range", () => {
    expect(clampStepCount(0)).toBe(1);
    expect(clampStepCount(-4)).toBe(1);
    expect(clampStepCount(2026)).toBe(MAX_STEP_COUNT);
  });

  it("rounds fractions", () => {
    expect(clampStepCount(2.6)).toBe(3);
  });
});

describe("validateGenerateArgs", () => {
  it("accepts a well-formed step", () => {
    const checked = validateGenerateArgs({
      type: "carousel",
      prompt: "  five AI tools  ",
      count: 3,
      sourceUrl: "https://ex.com/a",
      engine: "carousel_composer",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value).toMatchObject({
      type: "carousel",
      prompt: "five AI tools",
      count: 3,
      sourceUrl: "https://ex.com/a",
      engine: "carousel_composer",
      brandSurface: "default",
    });
    expect(checked.note).toBeUndefined();
  });

  it("fails an invented content type instead of handing it to Prisma", () => {
    const checked = validateGenerateArgs({ type: "newsletter", prompt: "x" });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toContain("newsletter");
    expect(checked.error).toContain("carousel");
  });

  it("fails a missing type", () => {
    expect(validateGenerateArgs({ prompt: "x" }).ok).toBe(false);
  });

  it("fails an empty prompt rather than making a blank draft", () => {
    const checked = validateGenerateArgs({ type: "post", prompt: "   " });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toBe("prompt missing");
  });

  it("defaults a non-number count and says so", () => {
    const checked = validateGenerateArgs({ type: "clip", prompt: "x", count: "8" });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.count).toBeUndefined();
    expect(checked.note).toContain("count");
  });

  it("clamps a runaway count and says so", () => {
    const checked = validateGenerateArgs({ type: "clip", prompt: "x", count: 500 });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.count).toBe(MAX_STEP_COUNT);
    expect(checked.note).toContain("clamped");
  });

  it("caps carousels at 5 and says so, since the composer would silently cap anyway", () => {
    const checked = validateGenerateArgs({ type: "carousel", prompt: "x", count: 8 });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.count).toBe(MAX_CAROUSEL_STEP_COUNT);
    expect(checked.note).toContain("clamped to 5");
  });

  it("leaves an in-range carousel count alone", () => {
    const checked = validateGenerateArgs({ type: "carousel", prompt: "x", count: 3 });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.count).toBe(3);
    expect(checked.note).toBeUndefined();
  });

  it("falls back to the default brand surface for an unknown one", () => {
    const checked = validateGenerateArgs({ type: "post", prompt: "x", brandSurface: "nope" });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.brandSurface).toBe("default");
  });

  it("drops non-string sourceUrl/engine instead of stringifying them", () => {
    const checked = validateGenerateArgs({ type: "post", prompt: "x", sourceUrl: 42, engine: null });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.sourceUrl).toBeUndefined();
    expect(checked.value.engine).toBeUndefined();
  });
});

describe("validateRecipeArgs", () => {
  it("accepts a slug with overrides", () => {
    const checked = validateRecipeArgs({
      slug: "podcast-to-clips",
      sourceUrl: "https://ex.com/ep.mp4",
      prompt: "this week",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value).toEqual({
      slug: "podcast-to-clips",
      sourceUrl: "https://ex.com/ep.mp4",
      prompt: "this week",
    });
  });

  it("fails a missing slug instead of looking up the string \"undefined\"", () => {
    const checked = validateRecipeArgs({});
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toBe("recipe slug missing");
  });

  it("fails a non-string slug", () => {
    expect(validateRecipeArgs({ slug: 7 }).ok).toBe(false);
    expect(validateRecipeArgs({ slug: "  " }).ok).toBe(false);
  });
});
