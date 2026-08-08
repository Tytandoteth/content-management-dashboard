import { NextResponse } from "next/server";
import type { ContentStatus } from "@cmd/contracts";
import { PostizClient } from "@cmd/integrations";
import { prisma } from "@cmd/db";
import { recordTransition } from "@/lib/content-service";
import { publishItem } from "@/lib/publish-service";
import { drainOutbox } from "@/lib/outbox";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/content/:id/publish-now — push an approved/scheduled item to Postiz,
 * then VERIFY Postiz actually delivered it before marking "published". If Postiz
 * reports state ERROR, the item stays `scheduled` with the error recorded (so
 * the dashboard tells the truth and you can retry) instead of falsely showing
 * published. Walks approved → scheduled → published.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // `{ republish: true }` lets an ALREADY-published item be re-pushed — for a post
  // that failed downstream, or one marked published without really delivering.
  // The per-channel dedup below (postedIntegrationIds) still applies, so a channel
  // that genuinely delivered is skipped and never double-posted.
  let republish = false;
  let asDraft = false;
  try {
    const body = (await req.json()) as { republish?: unknown; draft?: unknown } | null;
    republish = body?.republish === true;
    // Draft mode: create the post in Postiz's dashboard for manual review and
    // posting, instead of handing it to the delivery worker. This is the
    // reliable path for TikTok, whose worker leaves posts stuck in QUEUE and
    // never delivers them (2026-08-07). The item is NOT marked published.
    asDraft = body?.draft === true;
  } catch {
    /* no/invalid body → normal publish */
  }

  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const alreadyPublished = item.status === "published";
  const publishable = item.status === "approved" || item.status === "scheduled" || (republish && alreadyPublished);
  if (!publishable) {
    return NextResponse.json(
      { error: republish ? `nothing to republish (item is ${item.status})` : `item must be approved or scheduled (is ${item.status})` },
      { status: 409 },
    );
  }

  const apiUrl = env.postizApiUrl();
  const apiKey = env.postizApiKey();
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: "Postiz not configured", code: "postiz_not_configured" }, { status: 503 });
  }

  const client = new PostizClient({ baseUrl: apiUrl, apiKey });
  const now = new Date();

  // Draft mode short-circuits everything below: create the Postiz draft, leave
  // the item's status untouched (it is not published), and tell the operator to
  // finish it in Postiz. No status transition, no delivery verification — a
  // draft never delivers, so polling for PUBLISHED would just time out.
  if (asDraft) {
    let draftOut: Awaited<ReturnType<typeof publishItem>>;
    try {
      draftOut = await publishItem(
        { id: item.id, title: item.title, type: item.type, payload: (item.payload ?? {}) as Record<string, unknown>, assetUrls: item.assetUrls, scheduledAt: null, brandSurface: item.brandSurface },
        client,
        { asDraft: true },
      );
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
    if (draftOut.failures.length && !draftOut.posts.length) {
      return NextResponse.json(
        { error: `Draft creation failed: ${draftOut.failures.map((f) => `${f.provider} (${f.message})`).join("; ")}`, code: "draft_failed" },
        { status: 502 },
      );
    }
    await prisma.contentItem.update({
      where: { id },
      data: {
        payload: {
          ...((item.payload ?? {}) as Record<string, unknown>),
          postizPostId: draftOut.postizPostId,
          publishError: null,
        } as never,
      },
    });
    return NextResponse.json({
      status: "draft_created",
      message: `Draft created in Postiz for ${draftOut.platforms.join(", ") || "your channels"}. Open Postiz to review and post it.`,
      postizPostId: draftOut.postizPostId,
      platforms: draftOut.platforms,
    });
  }

  if (item.status === "approved") {
    await recordTransition({ contentItemId: id, to: "scheduled", actor: "publish-now", scheduledAt: now });
  }

  // Hand the post to Postiz. Each platform posts independently (fault-isolated)
  // and channels that already delivered are skipped (no duplicate on retry).
  let out: Awaited<ReturnType<typeof publishItem>>;
  try {
    out = await publishItem(
      { id: item.id, title: item.title, type: item.type, payload: (item.payload ?? {}) as Record<string, unknown>, assetUrls: item.assetUrls, scheduledAt: now, brandSurface: item.brandSurface },
      client,
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // Verify real delivery (Postiz delivers async). Poll each NEW post; an ERROR
  // means that channel failed — don't mark it delivered, so a retry re-attempts it.
  const delivered = new Set<string>(out.skipped); // channels already done stay done
  const failed = [...out.failures.map((f) => `${f.provider} (${f.message})`)];
  const okProviders: string[] = [];
  /** Accepted by Postiz but not delivered yet — neither success nor failure. */
  const pending: string[] = [];
  let releaseUrl: string | undefined;
  for (const p of out.posts) {
    let state: string | undefined;
    for (let i = 0; i < 4; i++) {
      const st = await client.getPostState(p.postId);
      if (st.found && st.state) {
        state = st.state;
        if (st.releaseUrl && !releaseUrl) releaseUrl = st.releaseUrl;
        if (state === "ERROR" || state === "PUBLISHED") break;
      }
      if (i < 3) await sleep(3000);
    }
    if (state === "ERROR") {
      failed.push(`${p.provider} (delivery rejected)`);
    } else if (state === "PUBLISHED") {
      p.integrationIds.forEach((id) => delivered.add(id));
      okProviders.push(p.provider);
    } else {
      // Still QUEUE/PENDING after the poll window. This used to fall into the
      // success branch — anything that wasn't ERROR was treated as delivered —
      // so an item sat in Postiz's queue while the dashboard claimed it was
      // published. Observed 2026-08-07: state QUEUE, releaseURL null, minutes
      // past its publish time, item marked `published`. Not delivered is not
      // failed either, so leave it `scheduled` and say so; a retry is safe
      // because postedIntegrationIds still excludes this channel.
      pending.push(`${p.provider} (${state ?? "no state"})`);
    }
  }

  const basePayload = (item.payload ?? {}) as Record<string, unknown>;
  const postedIntegrationIds = [...delivered];

  if (failed.length > 0) {
    // Partial/failed — keep `scheduled`, remember what already delivered so a
    // retry only re-attempts the failed channel(s). Report both sides truthfully.
    await prisma.contentItem.update({
      where: { id },
      data: {
        payload: {
          ...basePayload,
          postedIntegrationIds,
          publishError: `${okProviders.length ? `Published to ${okProviders.join(", ")}. ` : ""}Failed: ${failed.join("; ")}. Retry re-attempts only the failed channel(s).`,
        } as never,
      },
    });
    return NextResponse.json(
      { error: `Some channels failed: ${failed.join("; ")}.${okProviders.length ? ` Already published to ${okProviders.join(", ")} (won't be re-posted on retry).` : ""}`, code: "partial_publish", published: okProviders, failed },
      { status: 502 },
    );
  }

  if (pending.length > 0) {
    // Handed off but not out the door yet. Stay `scheduled` and say plainly that
    // it is queued — claiming "published" here is what made the dashboard lie.
    // The scheduler/analytics tick reconciles it once Postiz delivers; re-running
    // publish-now is safe and will re-check rather than double-post.
    const note = `Queued at Postiz, not delivered yet: ${pending.join("; ")}.${okProviders.length ? ` Delivered: ${okProviders.join(", ")}.` : ""} Check the Postiz calendar, then retry to re-check.`;
    await prisma.contentItem.update({
      where: { id },
      data: { payload: { ...basePayload, postedIntegrationIds, publishError: note } as never },
    });
    return NextResponse.json(
      { status: "queued", message: note, code: "publish_pending", pending, published: okProviders },
      { status: 202 },
    );
  }

  // Everything targeted delivered (or was already done) → mark published. When
  // this is a republish of an already-published item, skip the transition (it
  // would be illegal published→published) and just refresh delivery bookkeeping.
  let updated = alreadyPublished
    ? item
    : await recordTransition({ contentItemId: id, to: "published" as ContentStatus, actor: "publish-now", postizPostId: out.postizPostId, platforms: out.platforms });
  updated = await prisma.contentItem.update({
    where: { id },
    data: {
      payload: {
        ...((updated.payload ?? {}) as Record<string, unknown>),
        postedIntegrationIds,
        ...(releaseUrl ? { releaseUrl } : {}),
        publishError: null,
      } as never,
    },
  });
  void drainOutbox().catch(() => {});
  return NextResponse.json({ item: updated, published: okProviders.length ? okProviders : ["already delivered"], releaseUrl });
}
