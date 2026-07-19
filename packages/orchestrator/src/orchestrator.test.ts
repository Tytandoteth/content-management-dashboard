import { describe, expect, it } from "vitest";
import { HeuristicPlanner } from "./heuristic-planner.js";
import { toolUsesToPlan, openAiToolCallsToPlan, type AnthropicBlock } from "./claude-mapper.js";
import { isToolName } from "./tools.js";

const ctx = { recipeSlugs: ["podcast-to-clips", "daily-x-thread"] };
const planner = new HeuristicPlanner();

describe("HeuristicPlanner — generate_content", () => {
  it("turns 'podcast into 8 clips and queue them' into 8 clips", async () => {
    const plan = await planner.plan("Turn last week's podcast into 8 clips and queue them", ctx);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.tool).toBe("generate_content");
    expect(plan.steps[0]!.args).toMatchObject({ type: "clip", count: 8 });
    expect(plan.summary.toLowerCase()).toContain("queue");
  });

  it("extracts a source URL", async () => {
    const plan = await planner.plan("Make 5 clips from https://ex.com/ep.mp4", ctx);
    expect(plan.steps[0]!.args).toMatchObject({
      type: "clip",
      count: 5,
      sourceUrl: "https://ex.com/ep.mp4",
    });
  });

  it("detects threads", async () => {
    const plan = await planner.plan("Write an X thread about our new API", ctx);
    expect(plan.steps[0]!.args.type).toBe("thread");
    expect(plan.steps[0]!.args.prompt).toContain("API");
  });

  it("understands word-numbers", async () => {
    const plan = await planner.plan("make three videos about agents", ctx);
    expect(plan.steps[0]!.args).toMatchObject({ type: "video", count: 3 });
  });

  it("defaults to a single post", async () => {
    const plan = await planner.plan("announce our new partnership", ctx);
    expect(plan.steps[0]!.args).toMatchObject({ type: "post" });
    expect(plan.steps[0]!.args.count).toBeUndefined();
  });
});

describe("HeuristicPlanner — run_recipe", () => {
  it("routes an explicit recipe run", async () => {
    const plan = await planner.plan(
      "Run the podcast-to-clips recipe on https://ex.com/ep.mp4",
      ctx,
    );
    expect(plan.steps[0]!.tool).toBe("run_recipe");
    expect(plan.steps[0]!.args).toMatchObject({
      slug: "podcast-to-clips",
      sourceUrl: "https://ex.com/ep.mp4",
    });
  });

  it("matches a recipe by its tokens", async () => {
    const plan = await planner.plan("use the podcast to clips workflow", ctx);
    expect(plan.steps[0]!.tool).toBe("run_recipe");
    expect(plan.steps[0]!.args.slug).toBe("podcast-to-clips");
  });

  it("does not run a recipe without a run verb", async () => {
    const plan = await planner.plan("make a podcast clip", ctx);
    expect(plan.steps[0]!.tool).toBe("generate_content");
  });
});

describe("toolUsesToPlan (Claude mapper)", () => {
  it("maps text + tool_use blocks into a plan, dropping unknown tools", () => {
    const blocks: AnthropicBlock[] = [
      { type: "text", text: "I'll make 8 clips and hold them." },
      { type: "tool_use", name: "generate_content", input: { type: "clip", count: 8, prompt: "x" } },
      { type: "tool_use", name: "publish_now", input: {} }, // not in catalog → dropped
    ];
    const plan = toolUsesToPlan(blocks);
    expect(plan.planner).toBe("claude");
    expect(plan.summary).toContain("8 clips");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.tool).toBe("generate_content");
  });

  it("there is no publish tool in the catalog (HITL invariant)", () => {
    expect(isToolName("publish_now")).toBe(false);
    expect(isToolName("generate_content")).toBe(true);
    expect(isToolName("run_recipe")).toBe(true);
  });
});

describe("openAiToolCallsToPlan (OpenRouter mapper)", () => {
  it("maps content + tool_calls (JSON args) into a plan, dropping unknown tools", () => {
    const plan = openAiToolCallsToPlan({
      content: "I'll make 8 clips and hold them.",
      tool_calls: [
        { function: { name: "generate_content", arguments: JSON.stringify({ type: "clip", count: 8 }) } },
        { function: { name: "publish_now", arguments: "{}" } },
      ],
    });
    expect(plan.planner).toBe("openrouter");
    expect(plan.summary).toContain("8 clips");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.args).toMatchObject({ count: 8 });
  });

  it("degrades malformed JSON args to an empty object", () => {
    const plan = openAiToolCallsToPlan({
      content: "",
      tool_calls: [{ function: { name: "run_recipe", arguments: "{bad json" } }],
    });
    expect(plan.steps[0]!.tool).toBe("run_recipe");
    expect(plan.steps[0]!.args).toEqual({});
  });
});
