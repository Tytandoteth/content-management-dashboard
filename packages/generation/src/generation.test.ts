import { describe, expect, it } from "vitest";
import {
  GeneratorRegistry,
  NoGeneratorAvailableError,
  StubGenerator,
  computeSchedule,
  type GenerationBrief,
  type Generator,
  type GeneratorHealth,
} from "./index.js";

function gen(
  name: string,
  over: Partial<Generator> & { health?: GeneratorHealth } = {},
): Generator {
  const health = over.health ?? "ok";
  return {
    name,
    engine: over.engine ?? name,
    supports: over.supports ?? (["clip"] as never),
    manual: over.manual,
    healthcheck: async () => health,
    generate: async (brief) => ({
      engine: over.engine ?? name,
      assets: [{ url: `${name}://1`, type: brief.type }],
    }),
  };
}

const brief: GenerationBrief = {
  type: "clip",
  brandSurface: "default",
  prompt: "10 clips",
  count: 3,
};

describe("registry candidates", () => {
  it("returns non-manual generators that support the type", () => {
    const r = new GeneratorRegistry()
      .register(gen("a"))
      .register(gen("b", { supports: ["tweet"] as never }))
      .register(gen("opusclip", { manual: true }));
    const names = r.candidates(brief).map((g) => g.name);
    expect(names).toEqual(["a"]); // b is wrong type, opusclip is manual
  });

  it("honors an explicitly pinned engine", () => {
    const r = new GeneratorRegistry().register(gen("a")).register(gen("higgsfield"));
    expect(r.candidates({ ...brief, engine: "higgsfield" }).map((g) => g.name)).toEqual([
      "higgsfield",
    ]);
  });
});

describe("registry select — circuit breaker", () => {
  it("skips a down engine and routes to a healthy one", async () => {
    const r = new GeneratorRegistry()
      .register(gen("down1", { health: "down" }))
      .register(gen("healthy"));
    expect((await r.select(brief)).name).toBe("healthy");
  });

  it("prefers ok over degraded", async () => {
    const r = new GeneratorRegistry()
      .register(gen("deg", { health: "degraded" }))
      .register(gen("ok"));
    expect((await r.select(brief)).name).toBe("ok");
  });

  it("falls back to degraded when nothing is ok", async () => {
    const r = new GeneratorRegistry().register(gen("deg", { health: "degraded" }));
    expect((await r.select(brief)).name).toBe("deg");
  });

  it("treats a throwing healthcheck as down", async () => {
    const flaky = gen("flaky");
    flaky.healthcheck = async () => {
      throw new Error("boom");
    };
    const r = new GeneratorRegistry().register(flaky).register(gen("ok"));
    expect((await r.select(brief)).name).toBe("ok");
  });

  it("throws when all candidates are down", async () => {
    const r = new GeneratorRegistry().register(gen("d", { health: "down" }));
    await expect(r.select(brief)).rejects.toBeInstanceOf(NoGeneratorAvailableError);
  });

  it("throws when nothing supports the type", async () => {
    const r = new GeneratorRegistry().register(gen("a", { supports: ["tweet"] as never }));
    await expect(r.select(brief)).rejects.toBeInstanceOf(NoGeneratorAvailableError);
  });
});

describe("StubGenerator", () => {
  it("produces `count` assets from the brief", async () => {
    const result = await new StubGenerator().generate(brief);
    expect(result.assets).toHaveLength(3);
    expect(result.assets[0]!.type).toBe("clip");
    expect(result.assets[0]!.caption).toContain("10 clips");
  });
});

describe("computeSchedule", () => {
  it("assigns the next weekdays at the policy time, skipping the weekend", () => {
    // 2026-06-05 is a Friday → next slots are Mon 8th, Tue 9th, Wed 10th.
    const slots = computeSchedule(
      { kind: "weekday_slots", hour: 12, minute: 0 },
      3,
      new Date("2026-06-05T09:00:00Z"),
    );
    expect(slots.map((d) => d?.toISOString())).toEqual([
      "2026-06-08T12:00:00.000Z",
      "2026-06-09T12:00:00.000Z",
      "2026-06-10T12:00:00.000Z",
    ]);
  });

  it("returns nulls for immediate", () => {
    expect(computeSchedule({ kind: "immediate" }, 2, new Date())).toEqual([null, null]);
  });
});
