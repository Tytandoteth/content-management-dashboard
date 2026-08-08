import { NextResponse } from "next/server";
import { tick } from "@/lib/scheduler";
import { drainOutbox } from "@/lib/outbox";
import { requireMachineAuth } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/scheduler/tick — publish approved content that's due.
 * Intended for a Railway cron (every minute). Protected by the shared token, fail-closed.
 * Drains the outbox afterward so the content.published events reach n8n.
 */
export async function POST(request: Request) {
  const denied = requireMachineAuth(request);
  if (denied) return denied;

  const result = await tick();
  await drainOutbox().catch(() => {});
  return NextResponse.json(result);
}
