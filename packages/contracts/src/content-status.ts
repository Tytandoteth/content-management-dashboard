/**
 * The content lifecycle states (roadmap §2 — the state machine).
 *
 * Every piece of content — a tweet, a clip, a carousel — is one record moving
 * through these fixed states. Get this right and the rest is plumbing.
 */
export const CONTENT_STATUSES = [
  "idea",
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "measured",
  "rejected",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isContentStatus(value: unknown): value is ContentStatus {
  return (
    typeof value === "string" &&
    (CONTENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The brand surfaces the engine publishes for. This fork ships a single
 * "default" surface — multi-brand support was collapsed out of the box, but
 * the mechanism (BRAND_SURFACES list + per-brand Postiz channel lookup) is
 * still generic, so adding more surfaces later is additive.
 */
export const BRAND_SURFACES = ["default"] as const;
export type BrandSurface = (typeof BRAND_SURFACES)[number];

/** The default brand surface for newly created content in this fork. */
export const DEFAULT_BRAND_SURFACE: BrandSurface = "default";

/** Content item shapes the engine handles. Extend as new formats appear. */
export const CONTENT_TYPES = [
  "tweet",
  "thread",
  "clip",
  "carousel",
  "video",
  "post",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
