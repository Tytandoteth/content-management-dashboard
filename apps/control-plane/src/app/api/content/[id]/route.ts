import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** GET /api/content/:id — item + audit trail + recorded metrics. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      transitions: { orderBy: { at: "asc" } },
      metrics: { orderBy: { capturedAt: "desc" } },
    },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { transitions, metrics, ...rest } = item;
  return NextResponse.json({ item: rest, transitions, metrics });
}

const EDITABLE_STATES = ["idea", "draft", "in_review", "approved", "scheduled"];

/**
 * PATCH /api/content/:id — edit a non-terminal item.
 * Body: { title?, payload?, scheduledAt? }. Title/payload only before publish;
 * scheduledAt editable through `scheduled` (powers Approval edit + Calendar reschedule).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!EDITABLE_STATES.includes(item.status)) {
    return NextResponse.json({ error: `cannot edit a ${item.status} item` }, { status: 409 });
  }

  const data: Prisma.ContentItemUpdateInput = {};
  const preContent = ["idea", "draft", "in_review"].includes(item.status);
  if (typeof body.title === "string" && body.title.trim()) {
    if (!preContent) return NextResponse.json({ error: "title is locked after approval" }, { status: 409 });
    data.title = body.title;
  }
  if (body.payload !== undefined) {
    if (!preContent) return NextResponse.json({ error: "payload is locked after approval" }, { status: 409 });
    data.payload = body.payload as Prisma.InputJsonValue;
  }
  if (body.scheduledAt !== undefined) {
    data.scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.contentItem.update({ where: { id }, data });
  return NextResponse.json({ item: updated });
}
