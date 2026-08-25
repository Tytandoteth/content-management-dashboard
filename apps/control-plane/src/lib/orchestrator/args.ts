import {
  BRAND_SURFACES,
  CONTENT_TYPES,
  DEFAULT_BRAND_SURFACE,
  type BrandSurface,
  type ContentType,
} from "@cmd/contracts";

/**
 * Validation for the arguments an LLM planner hands us. Everything in a plan's
 * `args` was written by a model, so none of it can be trusted into a service
 * call: `type` went straight into a Prisma enum column (an invented type threw a
 * raw Prisma error mid-run), a string `count` slipped past a `typeof` check into
 * the generators, and a missing recipe slug became the literal string
 * "undefined" and then a "Recipe undefined not found" throw.
 *
 * These functions are pure so the whole matrix is unit-testable without a DB.
 */

/** Upper bound on how many items one planned step may produce. */
export const MAX_STEP_COUNT = 10;

/**
 * Carousels are the expensive format (an LLM compose plus two render passes
 * each), so the CarouselComposer caps a single brief at 5. Applying the same cap
 * here means the step reports the clamp instead of quietly returning five drafts
 * for a plan that promised eight.
 */
export const MAX_CAROUSEL_STEP_COUNT = 5;

export type ArgCheck<T> =
  | { ok: true; value: T; note?: string }
  | { ok: false; error: string };

export interface GenerateStepArgs {
  type: ContentType;
  brandSurface: BrandSurface;
  prompt: string;
  count?: number;
  engine?: string;
  sourceUrl?: string;
}

export interface RecipeStepArgs {
  slug: string;
  sourceUrl?: string;
  prompt?: string;
}

/** A usable count, or undefined when the planner gave us something that isn't one. */
export function clampStepCount(value: unknown, max: number = MAX_STEP_COUNT): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  return Math.min(max, rounded);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function describe(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  return value === undefined ? "undefined" : JSON.stringify(value) ?? String(value);
}

export function validateGenerateArgs(args: Record<string, unknown>): ArgCheck<GenerateStepArgs> {
  if (typeof args.type !== "string" || !(CONTENT_TYPES as readonly string[]).includes(args.type)) {
    return {
      ok: false,
      error: `unsupported content type ${describe(args.type)} (expected one of ${CONTENT_TYPES.join(", ")})`,
    };
  }
  const prompt = optionalString(args.prompt);
  if (!prompt) return { ok: false, error: "prompt missing" };

  const brandSurface =
    typeof args.brandSurface === "string" &&
    (BRAND_SURFACES as readonly string[]).includes(args.brandSurface)
      ? (args.brandSurface as BrandSurface)
      : DEFAULT_BRAND_SURFACE;

  const max = args.type === "carousel" ? MAX_CAROUSEL_STEP_COUNT : MAX_STEP_COUNT;
  const count = clampStepCount(args.count, max);
  let note: string | undefined;
  if (args.count !== undefined && count === undefined) {
    note = `ignored non-numeric count ${describe(args.count)}; producing 1`;
  } else if (typeof args.count === "number" && count !== undefined && count !== args.count) {
    note = `count ${args.count} clamped to ${count}`;
  }

  return {
    ok: true,
    value: {
      type: args.type as ContentType,
      brandSurface,
      prompt,
      ...(count !== undefined ? { count } : {}),
      ...(optionalString(args.engine) ? { engine: optionalString(args.engine)! } : {}),
      ...(optionalString(args.sourceUrl) ? { sourceUrl: optionalString(args.sourceUrl)! } : {}),
    },
    ...(note ? { note } : {}),
  };
}

export function validateRecipeArgs(args: Record<string, unknown>): ArgCheck<RecipeStepArgs> {
  const slug = optionalString(args.slug);
  if (!slug) return { ok: false, error: "recipe slug missing" };
  return {
    ok: true,
    value: {
      slug,
      ...(optionalString(args.sourceUrl) ? { sourceUrl: optionalString(args.sourceUrl)! } : {}),
      ...(optionalString(args.prompt) ? { prompt: optionalString(args.prompt)! } : {}),
    },
  };
}
