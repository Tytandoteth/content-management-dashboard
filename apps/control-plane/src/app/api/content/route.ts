import { NextResponse } from "next/server";
import { CONTENT_TYPES, BRAND_SURFACES } from "@cmd/contracts";
import { prisma } from "@cmd/db";
import { createContent } from "@/lib/content-service";

export const dynamic = "force-dynamic";

/** GET /api/content — list items, newest first; filter by status/type/brandSurface/q. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const type = sp.get("type");
  const brandSurface = sp.get("brandSurface");
  const q = sp.get("q");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (brandSurface) where.brandSurface = brandSurface;
  if (q && q.trim()) where.title = { contains: q.trim(), mode: "insensitive" };

  const items = await prisma.contentItem.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ items });
}

/** POST /api/content — create a new item (starts in idea/draft). */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const type = body.type;
  const title = body.title;
  const createdBy = body.createdBy ?? "system";

  if (typeof type !== "string" || !CONTENT_TYPES.includes(type as never)) {
    return NextResponse.json(
      { error: `type must be one of ${CONTENT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (
    body.brandSurface !== undefined &&
    !BRAND_SURFACES.includes(body.brandSurface as never)
  ) {
    return NextResponse.json(
      { error: `brandSurface must be one of ${BRAND_SURFACES.join(", ")}` },
      { status: 400 },
    );
  }

  const item = await createContent({
    type: type as never,
    brandSurface: body.brandSurface as never,
    title,
    payload: (body.payload as never) ?? undefined,
    assetUrls: Array.isArray(body.assetUrls) ? (body.assetUrls as string[]) : undefined,
    createdBy: String(createdBy),
    status: body.status === "idea" ? "idea" : "draft",
  });

  return NextResponse.json({ item }, { status: 201 });
}
