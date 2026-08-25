import type { OrchestrationPlan, ToolCall } from "@cmd/orchestrator";
import { runGeneration } from "../generation-service.js";
import { runRecipe } from "../recipe-service.js";
import { validateGenerateArgs, validateRecipeArgs } from "./args.js";

/**
 * Executes a plan by mapping each tool call onto the real services. Everything it
 * produces is a draft held for approval — there is no publish path here, which is
 * how the human-in-the-loop guarantee survives even when the brain is driving.
 *
 * Every argument is validated before it reaches a service (see ./args.ts): a
 * model-invented content type or a missing recipe slug fails ITS step with a
 * readable message instead of throwing a raw Prisma error, so the rest of the
 * plan still runs and the run still reports honestly.
 */

export interface StepResult {
  tool: ToolCall["tool"];
  ok: boolean;
  itemCount: number;
  itemIds: string[];
  error?: string;
  /** A caveat about a step that still succeeded (e.g. an out-of-range count). */
  note?: string;
}

export interface ExecutionResult {
  results: StepResult[];
  createdItemIds: string[];
}

export async function executePlan(plan: OrchestrationPlan): Promise<ExecutionResult> {
  const results: StepResult[] = [];
  const createdItemIds: string[] = [];

  for (const step of plan.steps) {
    try {
      const { itemIds, note } = await runStep(step);
      createdItemIds.push(...itemIds);
      results.push({
        tool: step.tool,
        ok: true,
        itemCount: itemIds.length,
        itemIds,
        ...(note ? { note } : {}),
      });
    } catch (err) {
      results.push({
        tool: step.tool,
        ok: false,
        itemCount: 0,
        itemIds: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { results, createdItemIds };
}

interface StepOutcome {
  itemIds: string[];
  note?: string;
}

async function runStep(step: ToolCall): Promise<StepOutcome> {
  if (step.tool === "generate_content") {
    const checked = validateGenerateArgs(step.args);
    if (!checked.ok) throw new Error(checked.error);
    const outcome = await runGeneration(checked.value, { createdBy: "orchestrator" });
    return { itemIds: outcome.items.map((i) => i.id), ...(checked.note ? { note: checked.note } : {}) };
  }

  if (step.tool === "run_recipe") {
    const checked = validateRecipeArgs(step.args);
    if (!checked.ok) throw new Error(checked.error);
    const { slug, ...overrides } = checked.value;
    const outcome = await runRecipe(slug, overrides);
    return { itemIds: outcome.items.map((i) => i.id) };
  }

  throw new Error(`Unknown tool: ${step.tool}`);
}
