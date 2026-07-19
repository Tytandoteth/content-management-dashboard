import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { composeSpec, normalizeSpec } from "./compose.js";

describe("normalizeSpec", () => {
  it("assigns hook to the first slide, cta to the last, body between", () => {
    const spec = normalizeSpec(
      {
        slides: [
          { role: "x", headline: "Hook line" },
          { role: "x", headline: "Tip one", body: "do this" },
          { role: "x", headline: "Closing" },
        ],
        caption: "cap",
        hashtags: ["ai", "#aitools"],
      },
      "Some topic",
      3,
    );
    expect(spec.slides.map((s) => s.role)).toEqual(["hook", "body", "cta"]);
    // Hashtags are normalized to always start with '#'.
    expect(spec.hashtags).toEqual(["#ai", "#aitools"]);
    expect(spec.caption).toBe("cap");
  });

  it("drops empty-headline slides and never returns an empty deck", () => {
    const spec = normalizeSpec({ slides: [{ headline: "" }], caption: "" }, "Fallback topic", 5);
    expect(spec.slides.length).toBeGreaterThan(0);
    expect(spec.slides[0]!.role).toBe("hook");
    // Empty caption falls back to the topic; missing hashtags fall back to brand set.
    expect(spec.caption).toBe("Fallback topic");
    expect(spec.hashtags.length).toBeGreaterThan(0);
  });
});

describe("composeSpec (no LLM key → deterministic stub)", () => {
  // Force the no-provider path even when a real key is present in the env.
  const saved = { o: process.env.OPENROUTER_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved.o !== undefined) process.env.OPENROUTER_API_KEY = saved.o;
    if (saved.a !== undefined) process.env.ANTHROPIC_API_KEY = saved.a;
  });

  it("produces a clamped deck with a hook and a cta", async () => {
    const spec = await composeSpec("Fireflies.ai", { slideCount: 4 });
    expect(spec.slides.length).toBe(4);
    expect(spec.slides[0]!.role).toBe("hook");
    expect(spec.slides[spec.slides.length - 1]!.role).toBe("cta");
    expect(spec.hashtags.length).toBeGreaterThan(0);
  });
});
