import {
  HeuristicPlanner,
  type OrchestrationPlan,
  type Planner,
  type ToolCall,
} from "@cmd/orchestrator";
import { prisma, type Prisma } from "@cmd/db";
import { env } from "../env.js";
import { OpenRouterPlanner } from "./openrouter-planner.js";
import { executePlan, type StepResult } from "./executor.js";
import { computeStatus, type OrchestrationStatus } from "./status.js";

/**
 * The orchestrator entrypoint (roadmap §6 Phase 4 — the brain on top of working
 * limbs). Plain-English in → plan → (optionally) execute. The OpenRouter planner
 * is used when a key is configured; otherwise the deterministic heuristic planner
 * keeps the feature working. Every run is logged for auditability. Nothing here
 * publishes — execution only produces drafts for the approval inbox.
 *
 * Auditability means the row has to exist BEFORE the work does. The run used to
 * be written only after execution finished, so a planner failure, a timeout, or
 * a serverless function that got killed mid-generation left drafts in the inbox
 * with no record of what made them. Now an executing run is written up front as
 * `running` and updated in a `finally`, so a crash leaves a `running` row and
 * every completed path leaves a final status.
 */

export type { OrchestrationStatus } from "./status.js";

/** One step as reported on the wire. Internal ids stay server-side. */
export interface PublicStepResult {
  tool: ToolCall["tool"];
  ok: boolean;
  error?: string;
  note?: string;
}

/** The POST /api/orchestrate 200 body. Shared contract with the Chat UI. */
export interface OrchestrationResponse {
  planner: string;
  plan: OrchestrationPlan;
  status: OrchestrationStatus;
  created: number;
  results: PublicStepResult[];
  runId?: string;
}

export interface OrchestrationResult extends OrchestrationResponse {
  /** Server-side only: did we run the plan (so the caller can drain the outbox)? */
  executed: boolean;
  /** Server-side only: ids of the drafts this run created. */
  createdItemIds: string[];
}

/** Strip the server-side fields, leaving exactly the wire contract. */
export function toResponse(result: OrchestrationResult): OrchestrationResponse {
  return {
    planner: result.planner,
    plan: result.plan,
    status: result.status,
    created: result.created,
    results: result.results,
    ...(result.runId ? { runId: result.runId } : {}),
  };
}

function toPublic(step: StepResult): PublicStepResult {
  return {
    tool: step.tool,
    ok: step.ok,
    ...(step.error ? { error: step.error } : {}),
    ...(step.note ? { note: step.note } : {}),
  };
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

const PLANNING_SUMMARY = "Planning…";

export async function orchestrate(
  request: string,
  options: { execute?: boolean } = {},
): Promise<OrchestrationResult> {
  const execute = options.execute ?? true;

  const recipeSlugs = (
    await prisma.recipe.findMany({ select: { slug: true } })
  ).map((r) => r.slug);

  const planner = buildPlanner();

  // Claim the audit row before any work happens, so planner failures and hard
  // crashes are both visible afterwards.
  let runId: string | undefined;
  if (execute) {
    const run = await prisma.orchestrationRun.create({
      data: {
        request,
        summary: PLANNING_SUMMARY,
        planner: planner.name,
        plan: {} as Prisma.InputJsonValue,
        status: "running",
        createdItemIds: [],
      },
      select: { id: true },
    });
    runId = run.id;
  }

  let plan: OrchestrationPlan | undefined;
  let results: StepResult[] = [];
  let createdItemIds: string[] = [];
  // Anything that escapes this function leaves the run marked failed.
  let status: OrchestrationStatus = "failed";
  let failure: string | undefined;

  try {
    plan = await planner.plan(request, { recipeSlugs });

    if (execute) {
      ({ results, createdItemIds } = await executePlan(plan));
      status = computeStatus(results);
    } else {
      status = "planned";
    }

    return {
      planner: plan.planner,
      plan,
      status,
      created: createdItemIds.length,
      results: results.map(toPublic),
      ...(runId ? { runId } : {}),
      executed: execute,
      createdItemIds,
    };
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const data = {
      summary: plan?.summary ?? (failure ? `Planning failed: ${failure}` : "No plan produced."),
      planner: plan?.planner ?? planner.name,
      plan: (plan ?? { summary: "", steps: [], planner: planner.name }) as unknown as Prisma.InputJsonValue,
      status,
      createdItemIds,
    };
    // Never let the audit write mask the real outcome (or the real error).
    if (runId) {
      await prisma.orchestrationRun.update({ where: { id: runId }, data }).catch(() => {});
    } else {
      await prisma.orchestrationRun.create({ data: { request, ...data } }).catch(() => {});
    }
  }
}
