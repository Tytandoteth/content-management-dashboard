import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { sendReply } from "@/lib/reply-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/replies/:id/action — { action: "approve" | "send" | "dismiss", editedText? }
 * "send" runs the send adapter (manual-copy in v1) and marks the reply sent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }
  const action = body.action;
  const editedText = typeof body.editedText === "string" && body.editedText.trim() ? body.editedText.trim() : undefined;

  const reply = await prisma.commentReply.findUnique({ where: { id } });
  if (!reply) return NextResponse.json({ error: "reply not found" }, { status: 404 });

  if (action === "dismiss") {
    const updated = await prisma.commentReply.update({ where: { id }, data: { status: "dismissed" } });
    return NextResponse.json({ reply: updated });
  }

  if (action === "approve") {
    const updated = await prisma.commentReply.update({
      where: { id },
      data: { status: "approved", ...(editedText ? { draftReply: editedText } : {}) },
    });
    return NextResponse.json({ reply: updated });
  }

  if (action === "send") {
    const draftReply = editedText ?? reply.draftReply;
    const result = await sendReply({ platform: reply.platform, draftReply, externalId: reply.externalId });
    const updated = await prisma.commentReply.update({
      where: { id },
      data: { status: "sent", draftReply, sentVia: result.via, sentAt: new Date() },
    });
    return NextResponse.json({ reply: updated, send: result });
  }

  return NextResponse.json({ error: "action must be approve | send | dismiss" }, { status: 400 });
}
