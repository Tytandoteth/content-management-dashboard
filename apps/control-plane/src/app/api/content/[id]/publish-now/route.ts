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
  try {
    const body = (await req.json()) as { republish?: unknown } | null;
    republish = body?.republish === true;
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
    } else {
      p.integrationIds.forEach((id) => delivered.add(id));
      okProviders.push(p.provider);
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
