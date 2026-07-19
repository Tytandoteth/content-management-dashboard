import { describe, it, expect, vi } from "vitest";
import {
  registerCarouselTemplate,
  resolveCarouselTemplate,
  getCarouselTemplate,
  listCarouselTemplates,
} from "./registry.js";
import { defineCarouselTemplate, type CarouselTemplate, type VNode } from "./template-api.js";

// A throwaway vnode — these tests never render, they only exercise the registry.
const stub = (): VNode => ({ type: "div", props: {} });
const stubTemplate = (over: Partial<CarouselTemplate>): CarouselTemplate => ({
  id: "stub",
  label: "Stub",
  hook: stub,
  body: stub,
  cta: stub,
  ...over,
});

describe("template registry", () => {
  it("registers the four builtins, editorial first in canonical order", () => {
    const list = listCarouselTemplates();
    const ids = list.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["editorial", "gradient-pop", "paper-light", "terminal-dev"]));
    const labels = list.map((t) => t.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Editorial", "Gradient Pop", "Paper Light", "Terminal Dev"]),
    );
    expect(list[0]?.id).toBe("editorial");
  });

  it("throws on a duplicate id, naming the colliding template", () => {
    expect(() =>
      registerCarouselTemplate(stubTemplate({ id: "editorial", label: "My Clone" })),
    ).toThrow(/editorial/);
  });

  it("resolves an unknown style to editorial and warns exactly once per id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editorial = getCarouselTemplate("editorial");

    const first = resolveCarouselTemplate("does-not-exist");
    const second = resolveCarouselTemplate("does-not-exist");
    expect(first).toBe(editorial);
    expect(second).toBe(editorial);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('unknown style "does-not-exist"');
    expect(msg).toContain('editorial');

    // Dedupe is per-id: a different unknown id warns again.
    resolveCarouselTemplate("also-missing");
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it("getCarouselTemplate returns undefined for an unknown id (no warn, no fallback)", () => {
    expect(getCarouselTemplate("nope-not-here")).toBeUndefined();
  });
});

describe("defineCarouselTemplate shape validation", () => {
  it("returns the def unchanged for a valid template", () => {
    const def = stubTemplate({ id: "valid-one" });
    expect(defineCarouselTemplate(def)).toBe(def);
  });

  it("rejects a non-kebab-case id", () => {
    expect(() => defineCarouselTemplate(stubTemplate({ id: "Not Kebab" }))).toThrow(/kebab-case/);
    expect(() => defineCarouselTemplate(stubTemplate({ id: "-leading" }))).toThrow(/kebab-case/);
    expect(() => defineCarouselTemplate(stubTemplate({ id: "double--dash" }))).toThrow(/kebab-case/);
  });

  it("rejects an empty label", () => {
    expect(() => defineCarouselTemplate(stubTemplate({ id: "empty-label", label: "   " }))).toThrow(/label/);
  });

  it("rejects a missing role renderer with a message naming the field", () => {
    const bad = { id: "no-body", label: "No Body", hook: stub, cta: stub } as unknown as CarouselTemplate;
    expect(() => defineCarouselTemplate(bad)).toThrow(/body/);
  });

  it("rejects a non-boolean premium flag", () => {
    const bad = stubTemplate({ id: "bad-premium", premium: "yes" as unknown as boolean });
    expect(() => defineCarouselTemplate(bad)).toThrow(/premium/);
  });
});
