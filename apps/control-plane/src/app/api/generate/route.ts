import { NextResponse } from "next/server";
import { CONTENT_TYPES, BRAND_SURFACES, DEFAULT_BRAND_SURFACE } from "@cmd/contracts";
import { NoGeneratorAvailableError } from "@cmd/generation";
import { CAROUSEL_STYLES } from "@cmd/carousel-render";
import { runGeneration } from "@/lib/generation-service";
import { drainOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/generate — generate content from a plain-English brief.
 * Body: { type, prompt, brandSurface?, count?, engine?, sourceUrl? }
 * Produced assets land as `draft` items in the approval inbox.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const type = body.type;
  const prompt = body.prompt;
  if (typeof type !== "string" || !CONTENT_TYPES.includes(type as never)) {
    return NextResponse.json(
      { error: `type must be one of ${CONTENT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (body.brandSurface !== undefined && !BRAND_SURFACES.includes(body.brandSurface as never)) {
    return NextResponse.json(
      { error: `brandSurface must be one of ${BRAND_SURFACES.join(", ")}` },
      { status: 400 },
    );
  }
  // Carousel visual style (optional). Validate against the known styles.
  const style = typeof body.style === "string" && CAROUSEL_STYLES.includes(body.style as never) ? body.style : undefined;

  try {
    const outcome = await runGeneration({
      type: type as never,
      brandSurface: (body.brandSurface as never) ?? DEFAULT_BRAND_SURFACE,
      prompt,
      count: typeof body.count === "number" ? body.count : undefined,
      engine: typeof body.engine === "string" ? body.engine : undefined,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
      ...(style ? { metadata: { style } } : {}),
    });
    void drainOutbox().catch(() => {});
    return NextResponse.json(
      { engine: outcome.engine, count: outcome.items.length, items: outcome.items },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NoGeneratorAvailableError) {
      return NextResponse.json({ error: err.message, code: "no_generator" }, { status: 503 });
    }
    throw err;
  }
}
