import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { loadArticles } from "@/lib/article";
import { pinnedComment } from "@/lib/replies";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/replies?status=drafted — the reply inbox + the list of published
 * carousels (with their article slug) to pick from when drafting a reply.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const [replies, articles] = await Promise.all([
    prisma.commentReply.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    loadArticles({ publishedOnly: true }),
  ]);
  // Resolve each reply's video title directly (not just from the published set),
  // so titles always show even if the source item's status has changed.
  const ids = [...new Set(replies.map((r) => r.contentItemId))];
  const items = ids.length ? await prisma.contentItem.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }) : [];
  const titleById = new Map(items.map((i) => [i.id, i.title]));
  return NextResponse.json({
    replies: replies.map((r) => ({ ...r, contentTitle: titleById.get(r.contentItemId) ?? null })),
    videos: articles.map((a) => {
      const url = `${env.resourceBaseUrl()}/r/${a.slug}`;
      return { id: a.id, title: a.title, slug: a.slug, status: a.status, articleUrl: url, pinned: pinnedComment(url, a.tools.length) };
    }),
  });
}
