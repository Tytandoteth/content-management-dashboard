import { NextResponse } from "next/server";
import { analyticsTick } from "@/lib/analytics-service";
import { drainOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";
// Same work as the cron tick: up to 50 items, each with a Postiz call.
export const maxDuration = 60;

/**
 * POST /api/analytics/run — run the analytics pass on demand from the dashboard.
 *
 * Same work as /api/analytics/tick, different door. The cron tick is guarded by
 * the x-cmd-signature service token, which a browser does not have and must not
 * be given; the "Run analytics" button used to POST there and got a 401 (or a
 * 503 on an install with no token) every single time, so the loop could only be
 * closed by a cron nobody had configured yet.
 *
 * This route is deliberately NOT in the middleware's public-route list, so
 * `clerkMiddleware` requires a signed-in team member before the handler runs —
 * the same auth every other dashboard API gets.
 */
export async function POST() {
  const result = await analyticsTick();
  // Best-effort: get the emitted `measured` events moving; cron is the backstop.
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
