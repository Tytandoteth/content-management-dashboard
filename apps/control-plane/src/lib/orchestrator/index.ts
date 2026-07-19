import {
  HeuristicPlanner,
  type OrchestrationPlan,
  type Planner,
} from "@cmd/orchestrator";
import { prisma, type Prisma } from "@cmd/db";
import { env } from "../env.js";
import { OpenRouterPlanner } from "./openrouter-planner.js";
import { executePlan, type StepResult } from "./executor.js";

/**
 * The orchestrator entrypoint (roadmap §6 Phase 4 — the brain on top of working
 * limbs). Plain-English in → plan → (optionally) execute. The OpenRouter planner
 * is used when a key is configured; otherwise the deterministic heuristic planner
 * keeps the feature working. Every run is logged for auditability. Nothing here
 * publishes — execution only produces drafts for the approval inbox.
 */

export interface OrchestrationResult {
  plan: OrchestrationPlan;
  executed: boolean;
  status: "planned" | "executed" | "failed";
  results: StepResult[];
  createdItemIds: string[];
}

/** OpenRouter if OPENROUTER_API_KEY is set, else the deterministic fallback. */
export function buildPlanner(): Planner {
  const key = env.openrouterApiKey();
  if (key) {
    return new OpenRouterPlanner({
      apiKey: key,
      model: env.orchestratorModel(),
      baseUrl: env.openrouterBaseUrl(),
    });
  }
  return new HeuristicPlanner();
}

export async function orchestrate(
  request: string,
  options: { execute?: boolean } = {},
): Promise<OrchestrationResult> {
  const execute = options.execute ?? true;

  const recipeSlugs = (
    await prisma.recipe.findMany({ select: { slug: true } })
  ).map((r) => r.slug);

  const planner = buildPlanner();
  const plan = await planner.plan(request, { recipeSlugs });

  let results: StepResult[] = [];
  let createdItemIds: string[] = [];
  let status: OrchestrationResult["status"] = "planned";

  if (execute) {
    ({ results, createdItemIds } = await executePlan(plan));
    status = results.some((r) => !r.ok) ? "failed" : "executed";
  }

  await prisma.orchestrationRun.create({
    data: {
      request,
      summary: plan.summary,
      planner: plan.planner,
      plan: plan as unknown as Prisma.InputJsonValue,
      status,
      createdItemIds,
    },
  });

  return { plan, executed: execute, status, results, createdItemIds };
}
