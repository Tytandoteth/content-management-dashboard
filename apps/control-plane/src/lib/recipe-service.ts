import { computeSchedule, type GenerationBrief, type SchedulePolicy } from "@cmd/generation";
import { DEFAULT_BRAND_SURFACE, type BrandSurface, type ContentType } from "@cmd/contracts";
import { prisma } from "@cmd/db";
import { runGeneration, type GenerationOutcome } from "./generation-service.js";

/**
 * Recipes (roadmap §5.3) — one-click saved workflows. A recipe stores a brief
 * template + count + schedule policy; running it expands into a batch of draft
 * content items (still held for approval) with publish slots pre-assigned.
 */

interface RecipeSpec {
  brief: {
    type: ContentType;
    prompt: string;
    brandSurface?: BrandSurface;
    sourceUrl?: string;
    engine?: string;
  };
  count: number;
  schedule: SchedulePolicy;
}

/** Per-run overrides — e.g. point a "Podcast → clips" recipe at this week's URL. */
export interface RecipeRunOverrides {
  sourceUrl?: string;
  prompt?: string;
}

export class RecipeNotFoundError extends Error {
  constructor(slug: string) {
    super(`Recipe ${slug} not found`);
    this.name = "RecipeNotFoundError";
  }
}

export async function runRecipe(
  slug: string,
  overrides: RecipeRunOverrides = {},
  now: Date = new Date(),
): Promise<GenerationOutcome> {
  const recipe = await prisma.recipe.findUnique({ where: { slug } });
  if (!recipe) throw new RecipeNotFoundError(slug);

  const spec = recipe.spec as unknown as RecipeSpec;
  const count = Math.max(1, spec.count ?? 1);

  const brief: GenerationBrief = {
    type: spec.brief.type,
    brandSurface: spec.brief.brandSurface ?? DEFAULT_BRAND_SURFACE,
    prompt: overrides.prompt ?? spec.brief.prompt,
    sourceUrl: overrides.sourceUrl ?? spec.brief.sourceUrl,
    engine: spec.brief.engine,
    count,
  };

  const scheduleSlots = computeSchedule(spec.schedule, count, now);

  return runGeneration(brief, { scheduleSlots, createdBy: `recipe:${slug}` });
}
