import { CONTENT_TYPES, BRAND_SURFACES } from "@cmd/contracts";

/**
 * The orchestrator's tool catalog (roadmap §6 Phase 4 — "treats every service as
 * a tool"). These are the only actions the intent layer may take, expressed as
 * Anthropic-tool-compatible JSON schemas so the same catalog drives both the
 * Claude planner and the deterministic fallback.
 *
 * Note what's deliberately ABSENT: there is no "publish" tool. The orchestrator
 * can make and queue content, but a human still approves anything that goes
 * public — the §2 hard rule holds even for the brain.
 */
export const ORCHESTRATOR_TOOLS = [
  {
    name: "generate_content",
    description:
      "Generate one or more pieces of content from a brief. Produced items are " +
      "saved as drafts held for approval — never published directly. Use for " +
      "ad-hoc requests like 'make 8 clips from this podcast' or 'write an X thread'.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: [...CONTENT_TYPES], description: "Output format." },
        prompt: { type: "string", description: "Plain-English brief / topic." },
        count: { type: "integer", minimum: 1, description: "How many to make. Default 1." },
        sourceUrl: { type: "string", description: "Source media to transform (e.g. a podcast URL)." },
        brandSurface: { type: "string", enum: [...BRAND_SURFACES], description: "Brand surface. Defaults to the configured brand surface." },
        engine: { type: "string", description: "Optional explicit engine name." },
      },
      required: ["type", "prompt"],
    },
  },
  {
    name: "run_recipe",
    description:
      "Run a saved recipe (a named workflow that generates a scheduled batch of " +
      "drafts). Prefer this when the request matches an existing recipe.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Recipe slug to run." },
        sourceUrl: { type: "string", description: "Override the recipe's source for this run." },
        prompt: { type: "string", description: "Override the recipe's prompt for this run." },
      },
      required: ["slug"],
    },
  },
] as const;

export type ToolName = (typeof ORCHESTRATOR_TOOLS)[number]["name"];

export const TOOL_NAMES = ORCHESTRATOR_TOOLS.map((t) => t.name) as ToolName[];

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && (TOOL_NAMES as string[]).includes(value);
}
