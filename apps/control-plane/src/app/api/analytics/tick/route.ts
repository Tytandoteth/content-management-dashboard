import { NextResponse } from "next/server";
import { analyticsTick } from "@/lib/analytics-service";
import { drainOutbox } from "@/lib/outbox";
import { requireMachineAuth } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";
// Up to 50 items, each with its own (timeout-bounded) Postiz call.
export const maxDuration = 60;

/**
 * POST /api/analytics/tick — pull metrics for published items, advance them to
 * `measured`, and sync KPIs. Intended for a Railway cron (every few minutes).
 * Token-guarded like the scheduler/outbox crons, fail-closed.
 *
 * This is the MACHINE entrypoint (x-cmd-signature). The dashboard button calls
 * /api/analytics/run, which is Clerk-session-authed — a browser has no service
 * token, so calling this one from the UI could only ever 401/503.
 */
export async function POST(request: Request) {
  const denied = requireMachineAuth(request);
  if (denied) return denied;
  const result = await analyticsTick();
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
