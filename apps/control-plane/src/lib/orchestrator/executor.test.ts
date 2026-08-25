import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrchestrationPlan } from "@cmd/orchestrator";

/**
 * The services are mocked so this stays a pure-logic test (no DB, no generators):
 * what's under test is that executePlan validates model-written args BEFORE the
 * call, keeps going after a bad step, and reports each step honestly.
 */
const runGeneration = vi.fn();
const runRecipe = vi.fn();

vi.mock("../generation-service.js", () => ({ runGeneration: (...a: unknown[]) => runGeneration(...a) }));
vi.mock("../recipe-service.js", () => ({ runRecipe: (...a: unknown[]) => runRecipe(...a) }));

const { executePlan } = await import("./executor.js");

function plan(...steps: OrchestrationPlan["steps"]): OrchestrationPlan {
  return { summary: "s", steps, planner: "test" };
}

beforeEach(() => {
  runGeneration.mockReset();
  runRecipe.mockReset();
  runGeneration.mockResolvedValue({ engine: "stub", items: [{ id: "i1" }] });
  runRecipe.mockResolvedValue({ engine: "stub", items: [{ id: "r1" }] });
});

describe("executePlan — argument validation", () => {
  it("fails a step with an invented content type without calling the service", async () => {
    const { results, createdItemIds } = await executePlan(
      plan({ tool: "generate_content", args: { type: "newsletter", prompt: "x" } }),
    );
    expect(runGeneration).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ tool: "generate_content", ok: false });
    expect(results[0]!.error).toContain("newsletter");
    expect(createdItemIds).toEqual([]);
  });

  it("fails a run_recipe step with no slug instead of looking up \"undefined\"", async () => {
    const { results } = await executePlan(plan({ tool: "run_recipe", args: {} }));
    expect(runRecipe).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ ok: false, error: "recipe slug missing" });
  });

  it("defaults a non-number count and notes it on the successful step", async () => {
    const { results } = await executePlan(
      plan({ tool: "generate_content", args: { type: "clip", prompt: "x", count: "8" } }),
    );
    expect(results[0]!.ok).toBe(true);
    expect(results[0]!.note).toContain("count");
    expect(runGeneration.mock.calls[0]![0]).toMatchObject({ type: "clip", prompt: "x" });
    expect(runGeneration.mock.calls[0]![0].count).toBeUndefined();
  });

  it("clamps a runaway count before it reaches the generators", async () => {
    const { results } = await executePlan(
      plan({ tool: "generate_content", args: { type: "post", prompt: "x", count: 2026 } }),
    );
    expect(results[0]!.ok).toBe(true);
    expect(runGeneration.mock.calls[0]![0].count).toBe(10);
  });
});

describe("executePlan — per-step isolation", () => {
  it("keeps running the plan after one step fails", async () => {
    const { results, createdItemIds } = await executePlan(
      plan(
        { tool: "generate_content", args: { type: "nope", prompt: "x" } },
        { tool: "generate_content", args: { type: "post", prompt: "y" } },
        { tool: "run_recipe", args: { slug: "daily-x-thread" } },
      ),
    );
    expect(results.map((r) => r.ok)).toEqual([false, true, true]);
    expect(createdItemIds).toEqual(["i1", "r1"]);
  });

  it("turns a thrown service error into a failed step, not a thrown run", async () => {
    runGeneration.mockRejectedValueOnce(new Error("no generator available"));
    const { results } = await executePlan(
      plan({ tool: "generate_content", args: { type: "video", prompt: "x" } }),
    );
    expect(results[0]).toMatchObject({ ok: false, error: "no generator available" });
  });
});
