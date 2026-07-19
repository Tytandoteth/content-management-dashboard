import { NextResponse } from "next/server";
import { isContentStatus, IllegalTransitionError } from "@cmd/contracts";
import { recordTransition, ContentNotFoundError } from "@/lib/content-service";
import { ModerationError } from "@/lib/moderation";
import { drainOutbox } from "@/lib/outbox";
import { exportStaging, type StagedBundle } from "@/lib/publish/staging-exporter";

// Filesystem export of the staged bundle needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/content/:id/transition — move an item to a new state.
 * Body: { to, actor, reason?, scheduledAt?, postizPostId?, platforms? }
 *
 * The state machine enforces legality and the reason requirement; this route
 * just maps the result to HTTP. After a successful transition it kicks the
 * outbox so emitted events reach n8n promptly (cron is the backstop).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const to = body.to;
  if (typeof to !== "string" || !isContentStatus(to)) {
    return NextResponse.json({ error: "invalid target status `to`" }, { status: 400 });
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor : null;
  if (!actor) {
    return NextResponse.json({ error: "actor is required" }, { status: 400 });
  }

  try {
    const item = await recordTransition({
      contentItemId: id,
      to,
      actor,
      reason: typeof body.reason === "string" ? body.reason : null,
      scheduledAt: body.scheduledAt ? new Date(String(body.scheduledAt)) : null,
      postizPostId: typeof body.postizPostId === "string" ? body.postizPostId : null,
      platforms: Array.isArray(body.platforms) ? (body.platforms as string[]) : undefined,
    });

    // Best-effort immediate delivery; failures are retried by the cron drain.
    void drainOutbox().catch(() => {});

    // Phase-1 publishing: when a carousel is approved, export a ready-to-post
    // bundle to the staging dir. Best-effort — a copy failure never fails the
    // approval; the bundle can be re-exported from the item detail page.
    let staged: Pick<StagedBundle, "dir" | "slideCount"> | undefined;
    if (item.type === "carousel" && to === "approved") {
      try {
        const bundle = await exportStaging(item);
        staged = { dir: bundle.dir, slideCount: bundle.slideCount };
      } catch (err) {
        console.warn(`[staging] export failed for ${item.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return NextResponse.json({ item, ...(staged ? { staged } : {}) });
  } catch (err) {
    if (err instanceof ContentNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof IllegalTransitionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof ModerationError) {
      return NextResponse.json(
        { error: err.message, code: "moderation_blocked", violations: err.violations },
        { status: 422 },
      );
    }
    throw err;
  }
}
