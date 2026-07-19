import { DEFAULT_BRAND_SURFACE, type BrandSurface, type ContentType } from "@cmd/contracts";
import type { OrchestrationPlan, ToolCall } from "@cmd/orchestrator";
import { runGeneration } from "../generation-service.js";
import { runRecipe } from "../recipe-service.js";

/**
 * Executes a plan by mapping each tool call onto the real services. Everything it
 * produces is a draft held for approval — there is no publish path here, which is
 * how the human-in-the-loop guarantee survives even when the brain is driving.
 */

export interface StepResult {
  tool: ToolCall["tool"];
  ok: boolean;
  itemCount: number;
  itemIds: string[];
  error?: string;
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
      const itemIds = await runStep(step);
      createdItemIds.push(...itemIds);
      results.push({ tool: step.tool, ok: true, itemCount: itemIds.length, itemIds });
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

async function runStep(step: ToolCall): Promise<string[]> {
  const a = step.args;
  if (step.tool === "generate_content") {
    const outcome = await runGeneration(
      {
        type: a.type as ContentType,
        brandSurface: (a.brandSurface as BrandSurface) ?? DEFAULT_BRAND_SURFACE,
        prompt: String(a.prompt ?? ""),
        count: typeof a.count === "number" ? a.count : undefined,
        engine: typeof a.engine === "string" ? a.engine : undefined,
        sourceUrl: typeof a.sourceUrl === "string" ? a.sourceUrl : undefined,
      },
      { createdBy: "orchestrator" },
    );
    return outcome.items.map((i) => i.id);
  }

  if (step.tool === "run_recipe") {
    const outcome = await runRecipe(String(a.slug), {
      sourceUrl: typeof a.sourceUrl === "string" ? a.sourceUrl : undefined,
      prompt: typeof a.prompt === "string" ? a.prompt : undefined,
    });
    return outcome.items.map((i) => i.id);
  }

  throw new Error(`Unknown tool: ${step.tool}`);
}
