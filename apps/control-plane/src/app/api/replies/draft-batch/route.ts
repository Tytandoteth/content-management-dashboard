import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { draftReply } from "@/lib/replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/replies/draft-batch — draft AI replies for MANY comments on one video
 * at once (paste a batch, get all drafts). Each is persisted as `drafted` and
 * shows up in the queue with a one-click copy.
 * Body: { contentItemId, comments: string[] }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const contentItemId = typeof body.contentItemId === "string" ? body.contentItemId : "";
  const comments = Array.isArray(body.comments)
    ? (body.comments as unknown[]).filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
    : [];
  if (!contentItemId) return NextResponse.json({ error: "contentItemId is required" }, { status: 400 });
  if (comments.length === 0) return NextResponse.json({ error: "at least one comment is required" }, { status: 400 });
  if (comments.length > 25) return NextResponse.json({ error: "max 25 comments per batch" }, { status: 400 });
  const platform = "tiktok";

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) return NextResponse.json({ error: "video not found" }, { status: 404 });

  // Draft all in parallel, then persist the ones that produced a reply.
  const drafted = await Promise.all(
    comments.map(async (comment) => {
      try {
        const out = await draftReply({ item, comment });
        return out ? { comment, reply: out.reply } : null;
      } catch {
        return null;
      }
    }),
  );
  const ok = drafted.filter((d): d is { comment: string; reply: string } => d !== null);
  if (ok.length === 0) {
    return NextResponse.json({ error: "Couldn't draft replies — is this a carousel with a usable spec?", code: "no_spec" }, { status: 409 });
  }

  await prisma.commentReply.createMany({
    data: ok.map((d) => ({ contentItemId, platform, comment: d.comment, draftReply: d.reply, status: "drafted" })),
  });

  return NextResponse.json({ created: ok.length, skipped: comments.length - ok.length }, { status: 201 });
}
