import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { exportStaging } from "@/lib/publish/staging-exporter";

// Filesystem export needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/content/:id/stage — (re)export an approved carousel as a
 * ready-to-post bundle on disk. Idempotent: overwrites the existing bundle.
 * Does not change the item's state.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (item.type !== "carousel") {
    return NextResponse.json({ error: "only carousels can be staged" }, { status: 409 });
  }

  try {
    const bundle = await exportStaging(item);
    return NextResponse.json({
      dir: bundle.dir,
      slideCount: bundle.slideCount,
      captionPath: bundle.captionPath,
      files: bundle.files,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
