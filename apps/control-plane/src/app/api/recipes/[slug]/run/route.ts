import { NextResponse } from "next/server";
import { NoGeneratorAvailableError } from "@cmd/generation";
import { runRecipe, RecipeNotFoundError } from "@/lib/recipe-service";
import { drainOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";

/**
 * POST /api/recipes/:slug/run — expand a recipe into draft content.
 * Optional body: { sourceUrl?, prompt? } to point it at this run's source.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  try {
    const outcome = await runRecipe(slug, {
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
      prompt: typeof body.prompt === "string" ? body.prompt : undefined,
    });
    void drainOutbox().catch(() => {});
    return NextResponse.json(
      { engine: outcome.engine, count: outcome.items.length, items: outcome.items },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof RecipeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof NoGeneratorAvailableError) {
      return NextResponse.json({ error: err.message, code: "no_generator" }, { status: 503 });
    }
    throw err;
  }
}
