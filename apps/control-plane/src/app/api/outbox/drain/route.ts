import { NextResponse } from "next/server";
import { drainOutbox } from "@/lib/outbox";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/outbox/drain — deliver pending events to n8n. Intended to be hit by
 * a Railway cron every minute as the reliable backstop for event delivery.
 * Protected by the shared control-plane token.
 */
export async function POST(request: Request) {
  const token = env.controlPlaneApiToken();
  if (token) {
    const provided = request.headers.get("x-cmd-signature");
    if (provided !== token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await drainOutbox();
  return NextResponse.json(result);
}
