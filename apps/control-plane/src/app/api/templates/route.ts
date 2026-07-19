import { NextResponse } from "next/server";
import { listCarouselTemplates } from "@cmd/carousel-render";

export const dynamic = "force-dynamic";

/** GET /api/templates — registered carousel styles (builtins + installed packs), for the style picker. */
export async function GET() {
  const templates = listCarouselTemplates().map((t) => ({
    id: t.id,
    label: t.label,
    premium: !!t.premium,
  }));
  return NextResponse.json({ templates });
}
