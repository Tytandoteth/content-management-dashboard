import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { draftReply } from "@/lib/replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/replies/draft — draft an AI reply to a comment on a published video.
 * Body: { contentItemId, comment, commenter? }. Persists as `drafted`.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const contentItemId = typeof body.contentItemId === "string" ? body.contentItemId : "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!contentItemId) return NextResponse.json({ error: "contentItemId is required" }, { status: 400 });
  if (!comment) return NextResponse.json({ error: "comment is required" }, { status: 400 });
  const platform = "tiktok";
  const commenter = typeof body.commenter === "string" && body.commenter.trim() ? body.commenter.trim() : undefined;

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) return NextResponse.json({ error: "video not found" }, { status: 404 });

  const drafted = await draftReply({ item, comment, commenter });
  if (!drafted) {
    return NextResponse.json(
      { error: "That item isn't a carousel with a usable spec, so there's no resource article to point to.", code: "no_spec" },
      { status: 409 },
    );
  }

  const reply = await prisma.commentReply.create({
    data: { contentItemId, platform, comment, commenter, draftReply: drafted.reply, status: "drafted" },
  });
  return NextResponse.json({ reply: { ...reply, contentTitle: item.title }, context: drafted.context }, { status: 201 });
}
