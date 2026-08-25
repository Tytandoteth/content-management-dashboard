import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** How many runs the Chat history pane shows. */
const HISTORY_LIMIT = 20;

/**
 * GET /api/orchestration-runs — recent orchestrator runs (Chat history).
 *
 * Selects only what the history pane renders. The full `plan` JSON was the bulk
 * of the payload and nothing displayed it, so 50 runs of plans crossed the wire
 * on every page load for no reason.
 */
export async function GET() {
  const runs = await prisma.orchestrationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      request: true,
      summary: true,
      planner: true,
      status: true,
      createdItemIds: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ runs });
}
