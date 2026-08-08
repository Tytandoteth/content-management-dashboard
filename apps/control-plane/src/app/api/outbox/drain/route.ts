import { NextResponse } from "next/server";
import { drainOutbox } from "@/lib/outbox";
import { requireMachineAuth } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/outbox/drain — deliver pending events to n8n. Intended to be hit by
 * a Railway cron every minute as the reliable backstop for event delivery.
 * Protected by the shared control-plane token, fail-closed.
 */
export async function POST(request: Request) {
  const denied = requireMachineAuth(request);
  if (denied) return denied;

  const result = await drainOutbox();
  return NextResponse.json(result);
}
