import { NextResponse } from "next/server";
import { analyticsTick } from "@/lib/analytics-service";
import { drainOutbox } from "@/lib/outbox";
import { requireMachineAuth } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/tick — pull metrics for published items, advance them to
 * `measured`, and sync KPIs. Intended for a Railway cron (every few minutes).
 * Token-guarded like the scheduler/outbox crons, fail-closed.
 */
export async function POST(request: Request) {
  const denied = requireMachineAuth(request);
  if (denied) return denied;
  const result = await analyticsTick();
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
