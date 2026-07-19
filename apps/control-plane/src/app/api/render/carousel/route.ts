import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { CarouselSpec } from "@cmd/carousel-render";
import { composeSpec } from "@/lib/carousel/compose";
import { renderAndStore } from "@/lib/carousel/store";

// Native render libs (resvg/satori) require the Node runtime, not edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/render/carousel — render branded slides for preview/testing.
 * Body: { spec } to render an exact CarouselSpec, or { topic, slideCount? } to
 * compose then render. Returns the stored slide URLs (served at /carousels/...).
 * This does NOT create a content item — it's a pure render endpoint.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let spec: CarouselSpec;
  const rawSpec = body.spec as CarouselSpec | undefined;
  if (rawSpec && Array.isArray(rawSpec.slides) && rawSpec.slides.length > 0) {
    spec = rawSpec;
  } else if (typeof body.topic === "string" && body.topic.trim()) {
    spec = await composeSpec(body.topic, {
      slideCount: typeof body.slideCount === "number" ? body.slideCount : undefined,
    });
  } else {
    return NextResponse.json({ error: "provide `spec` or `topic`" }, { status: 400 });
  }

  const id = randomUUID().slice(0, 8);
  const stored = await renderAndStore(id, spec);
  return NextResponse.json({ id, files: stored.files, dir: stored.dir, spec }, { status: 201 });
}
