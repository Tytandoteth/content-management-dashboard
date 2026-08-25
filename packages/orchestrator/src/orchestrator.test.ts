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

describe("HeuristicPlanner — count hardening", () => {
  it("ignores a year that is not a count", async () => {
    const plan = await planner.plan("write something about the 2026 election", ctx);
    expect(plan.steps[0]!.args.count).toBeUndefined();
    expect(plan.summary).toContain("Generate 1 ");
  });

  it("ignores digits inside a source URL", async () => {
    const plan = await planner.plan("summarize https://ex.com/2026/05/12/ep-42", ctx);
    expect(plan.steps[0]!.args.count).toBeUndefined();
    expect(plan.steps[0]!.args.sourceUrl).toBe("https://ex.com/2026/05/12/ep-42");
  });

  it("reads a count only when it sits next to a content word", async () => {
    const plan = await planner.plan("make 3 carousels about AI agents", ctx);
    expect(plan.steps[0]!.args).toMatchObject({ type: "carousel", count: 3 });
  });

  it("clamps an absurd count to 10", async () => {
    const plan = await planner.plan("make 99 posts about launch week", ctx);
    expect(plan.steps[0]!.args.count).toBe(10);
  });

  it("clamps word-numbers above the ceiling", async () => {
    const plan = await planner.plan("make twelve clips from the show", ctx);
    expect(plan.steps[0]!.args.count).toBe(10);
  });

  it("does not treat a duration as a count", async () => {
    const plan = await planner.plan("script a 60 second explainer", ctx);
    expect(plan.steps[0]!.args.count).toBeUndefined();
  });
});

describe("HeuristicPlanner — type priority", () => {
  it("routes a carousel request to carousel even when it mentions video tools", async () => {
    const plan = await planner.plan("make a carousel about AI video tools", ctx);
    expect(plan.steps[0]!.args.type).toBe("carousel");
  });

  it("still routes a clip request to clip", async () => {
    const plan = await planner.plan("cut 4 clips from the stream", ctx);
    expect(plan.steps[0]!.args).toMatchObject({ type: "clip", count: 4 });
  });
});

describe("HeuristicPlanner — honesty about what it cannot automate", () => {
  it("flags scheduling/publishing clauses it cannot plan", async () => {
    const plan = await planner.plan("write 2 posts and publish them tonight", ctx);
    expect(plan.summary).toContain("not automated from chat");
    expect(plan.note).toContain("not automated from chat");
    // Still plans the part it CAN do.
    expect(plan.steps[0]!.args).toMatchObject({ type: "post", count: 2 });
  });

  it("stays quiet when there is nothing it cannot do", async () => {
    const plan = await planner.plan("write an X thread about our new API", ctx);
    expect(plan.summary).not.toContain("not automated");
    expect(plan.note).toBeUndefined();
  });
});

describe("HeuristicPlanner — run_recipe", () => {
  it("matches a recipe whose slug is not lowercase", async () => {
    const plan = await planner.plan("run the Podcast-To-Clips recipe", {
      recipeSlugs: ["Podcast-To-Clips"],
    });
    expect(plan.steps[0]!.tool).toBe("run_recipe");
    // The ORIGINAL slug is passed through — it's the DB key.
    expect(plan.steps[0]!.args.slug).toBe("Podcast-To-Clips");
  });

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

  it("names the dropped tools instead of discarding them silently", () => {
    const plan = toolUsesToPlan([
      { type: "text", text: "Making clips." },
      { type: "tool_use", name: "generate_content", input: { type: "clip" } },
      { type: "tool_use", name: "publish_now", input: {} },
      { type: "tool_use", name: "delete_everything", input: {} },
    ]);
    expect(plan.note).toContain("publish_now");
    expect(plan.note).toContain("delete_everything");
    expect(plan.summary).toContain("publish_now");
    expect(plan.steps).toHaveLength(1);
  });

  it("has no note when every tool call was in the catalog", () => {
    const plan = toolUsesToPlan([
      { type: "tool_use", name: "generate_content", input: { type: "clip" } },
    ]);
    expect(plan.note).toBeUndefined();
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
    expect(plan.note).toBeUndefined();
  });

  it("names dropped tool calls", () => {
    const plan = openAiToolCallsToPlan({
      content: "Posting it now.",
      tool_calls: [{ function: { name: "publish_now", arguments: "{}" } }],
    });
    expect(plan.steps).toHaveLength(0);
    expect(plan.note).toContain("publish_now");
    expect(plan.summary).toContain("publish_now");
  });
});
