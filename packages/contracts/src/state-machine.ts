import type { ContentStatus } from "./content-status.js";

/**
 * The legal transition graph (roadmap §2).
 *
 *   idea → draft → in_review → approved → scheduled → published → measured
 *                      ↘ rejected (carries reason) → draft
 *
 * This is the ONLY source of truth for what state changes are allowed. The
 * control plane refuses any transition not encoded here, which is what makes
 * the hard rules below structurally true rather than hopefully true.
 */
export const TRANSITIONS: Readonly<Record<ContentStatus, readonly ContentStatus[]>> = {
  idea: ["draft"],
  draft: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["scheduled"],
  scheduled: ["published"],
  published: ["measured"],
  measured: [],
  rejected: ["draft"],
} as const;

/**
 * Transitions that REQUIRE a human-supplied reason. Rejecting an item must
 * carry the reason back so the AI learns the brand's taste over time (§2).
 */
export const REASON_REQUIRED_TARGETS: readonly ContentStatus[] = ["rejected"];

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: "illegal_transition" | "reason_required"; message: string };

export interface TransitionOptions {
  /** A human-readable reason. Required when moving to a reason-gated state. */
  reason?: string | null;
}

/** Is `to` reachable from `from` in a single legal step? */
export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a proposed transition, including the reason requirement.
 * Returns a discriminated result rather than throwing, so callers can map it
 * to an API response. Use {@link assertTransition} when you want it to throw.
 */
export function checkTransition(
  from: ContentStatus,
  to: ContentStatus,
  options: TransitionOptions = {},
): TransitionCheck {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: "illegal_transition",
      message: `Illegal transition: ${from} → ${to}. Allowed from ${from}: [${
        TRANSITIONS[from].join(", ") || "none"
      }].`,
    };
  }

  if (REASON_REQUIRED_TARGETS.includes(to) && !options.reason?.trim()) {
    return {
      ok: false,
      code: "reason_required",
      message: `Transition ${from} → ${to} requires a non-empty reason.`,
    };
  }

  return { ok: true };
}

export class IllegalTransitionError extends Error {
  readonly code: "illegal_transition" | "reason_required";
  constructor(check: Extract<TransitionCheck, { ok: false }>) {
    super(check.message);
    this.name = "IllegalTransitionError";
    this.code = check.code;
  }
}

/** Throwing variant of {@link checkTransition}. */
export function assertTransition(
  from: ContentStatus,
  to: ContentStatus,
  options: TransitionOptions = {},
): void {
  const result = checkTransition(from, to, options);
  if (!result.ok) throw new IllegalTransitionError(result);
}

/** Terminal states have no outgoing transitions. */
export function isTerminal(status: ContentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Hard rule (§2): no item may reach `published` without passing `in_review`.
 * This proves the human-in-the-loop guarantee from the graph itself — every
 * path into `published` is forced through `in_review`. Used by tests; useful
 * as a documented invariant.
 */
export function everyPathToPublishedPassesReview(): boolean {
  // BFS every path from `idea` to `published`; assert `in_review` is on each.
  const paths: ContentStatus[][] = [["idea"]];
  const completePaths: ContentStatus[][] = [];

  while (paths.length > 0) {
    const path = paths.pop()!;
    const tail = path[path.length - 1]!;
    if (tail === "published") {
      completePaths.push(path);
      continue;
    }
    for (const next of TRANSITIONS[tail]) {
      if (path.includes(next)) continue; // avoid cycles (rejected → draft)
      paths.push([...path, next]);
    }
  }

  return (
    completePaths.length > 0 &&
    completePaths.every((path) => path.includes("in_review"))
  );
}
