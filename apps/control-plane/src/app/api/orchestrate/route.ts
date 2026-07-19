import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/orchestrator";
import { drainOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";

/**
 * POST /api/orchestrate — the Chat/Ask endpoint.
 * Body: { request: string, execute?: boolean }
 *  - execute=false → return the plan only (preview before doing it)
 *  - execute=true (default) → run the plan, producing drafts for approval
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const ask = body.request;
  if (typeof ask !== "string" || !ask.trim()) {
    return NextResponse.json({ error: "request (string) is required" }, { status: 400 });
  }

  const result = await orchestrate(ask, {
    execute: body.execute === false ? false : true,
  });

  if (result.executed) void drainOutbox().catch(() => {});

  return NextResponse.json(result);
}
