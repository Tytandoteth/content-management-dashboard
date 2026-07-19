import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { pushCarouselDraft, TikTokConfigError } from "@/lib/tiktok-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/content/:id/push-tiktok — push an approved carousel to the connected
 * TikTok account's inbox/drafts (MEDIA_UPLOAD). The creator finishes posting in
 * the TikTok app. Records the returned publish_id on the item for reference.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (item.type !== "carousel") {
    return NextResponse.json({ error: "only carousels can be pushed to TikTok" }, { status: 409 });
  }
  if (!["approved", "scheduled", "published"].includes(item.status)) {
    return NextResponse.json({ error: `item must be approved first (is ${item.status})` }, { status: 409 });
  }

  try {
    const { publishId, imageCount } = await pushCarouselDraft(item);
    await prisma.contentItem.update({
      where: { id },
      data: {
        payload: {
          ...((item.payload ?? {}) as Record<string, unknown>),
          tiktokPublishId: publishId,
          tiktokPushedAt: new Date().toISOString(),
        } as never,
      },
    });
    return NextResponse.json({ publishId, imageCount });
  } catch (err) {
    const isConfig = err instanceof TikTokConfigError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: isConfig ? "tiktok_config" : "tiktok_error" },
      { status: isConfig ? 503 : 502 },
    );
  }
}
