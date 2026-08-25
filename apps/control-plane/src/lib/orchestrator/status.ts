/**
 * The status an orchestration run reports. This used to be a two-way flag
 * ("executed" unless ANY step failed → "failed"), which read a nine-out-of-ten
 * success as a total failure and reported a plan with no steps at all as a
 * successful execution. Kept pure and separate so the matrix is unit-testable
 * without a database.
 */
export type OrchestrationStatus = "planned" | "empty" | "executed" | "partial" | "failed";

/** Status for a run that actually executed its plan. */
export function computeStatus(results: ReadonlyArray<{ ok: boolean }>): OrchestrationStatus {
  if (results.length === 0) return "empty";
  const okCount = results.reduce((n, r) => n + (r.ok ? 1 : 0), 0);
  if (okCount === results.length) return "executed";
  if (okCount === 0) return "failed";
  return "partial";
}
