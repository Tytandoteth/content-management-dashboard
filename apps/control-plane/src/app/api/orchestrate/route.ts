import { NextResponse } from "next/server";
import { orchestrate, toResponse } from "@/lib/orchestrator";
import { drainOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";
// Planning plus generation is the longest request this app serves; without an
// explicit budget it inherits the platform default (10s on Vercel) and dies
// mid-generation, leaving orphaned drafts. Every other long route sets this.
export const maxDuration = 60;

/** Longest request we will plan. Anything past this is a paste, not a request,
 *  and it bloats both the planner prompt and the audit row. */
const MAX_REQUEST_CHARS = 2000;

/**
 * POST /api/orchestrate — the Chat/Ask endpoint.
 * Body: { request: string, execute?: boolean }
 *  - execute=false → return the plan only (preview before doing it)
 *  - execute=true (default) → run the plan, producing drafts for approval
 *
 * Responses:
 *  - 200 { planner, plan, status, created, results, runId? }
 *  - 400 { error }  validation
 *  - 500 { error }  anything else. Always JSON, never an HTML error page: the
 *    Chat UI parses the body before checking res.ok.
 */
export async function POST(request: Request) {
  try {
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
    const trimmed = ask.trim();
    if (trimmed.length > MAX_REQUEST_CHARS) {
      return NextResponse.json(
        { error: `request too long (max ${MAX_REQUEST_CHARS} chars)` },
        { status: 400 },
      );
    }

    const result = await orchestrate(trimmed, {
      execute: body.execute === false ? false : true,
    });

    if (result.executed) void drainOutbox().catch(() => {});

    return NextResponse.json(toResponse(result));
  } catch (err) {
    console.error("[orchestrate] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "orchestration failed" },
      { status: 500 },
    );
  }
}
