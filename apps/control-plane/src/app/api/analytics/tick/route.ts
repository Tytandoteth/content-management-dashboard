import { NextResponse } from "next/server";
import { analyticsTick } from "@/lib/analytics-service";
import { drainOutbox } from "@/lib/outbox";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/tick — pull metrics for published items, advance them to
 * `measured`, and sync KPIs. Intended for a Railway cron (every few minutes).
 * Token-guarded like the scheduler/outbox crons.
 */
export async function POST(request: Request) {
  const token = env.controlPlaneApiToken();
  if (token && request.headers.get("x-cmd-signature") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await analyticsTick();
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
