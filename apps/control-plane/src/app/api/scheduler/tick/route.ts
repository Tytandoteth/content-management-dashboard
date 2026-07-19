import { NextResponse } from "next/server";
import { tick } from "@/lib/scheduler";
import { drainOutbox } from "@/lib/outbox";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/scheduler/tick — publish approved content that's due.
 * Intended for a Railway cron (every minute). Protected by the shared token.
 * Drains the outbox afterward so the content.published events reach n8n.
 */
export async function POST(request: Request) {
  const token = env.controlPlaneApiToken();
  if (token) {
    if (request.headers.get("x-cmd-signature") !== token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await tick();
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
