import type { ToolName } from "./tools.js";

/** One planned action: a tool plus its arguments. */
export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
  /** Why the planner chose this step (shown to the user before executing). */
  reason?: string;
}

/** What the orchestrator intends to do for a request, before doing it. */
export interface OrchestrationPlan {
  /** One-line plain-English summary of the plan. */
  summary: string;
  steps: ToolCall[];
  /** Which planner produced this ("claude" | "heuristic"). */
  planner: string;
}

/** Context the planner can use to ground its decisions. */
export interface PlannerContext {
  /** Slugs of recipes that currently exist, so the planner can prefer them. */
  recipeSlugs: string[];
}

export interface Planner {
  readonly name: string;
  plan(request: string, context: PlannerContext): Promise<OrchestrationPlan>;
}
