/**
 * The template registry — the single source of truth for which carousel looks
 * exist. Builtins and installed packs are registered here at module load; the
 * renderer resolves a deck's `style` to a template and dispatches by slide role.
 *
 * Load order: BUILTIN_TEMPLATES (canonical order) then INSTALLED_TEMPLATES (from
 * the generated index). `listCarouselTemplates()` returns builtins first in that
 * canonical order, then installed packs sorted alphabetically by id.
 */

import { defineCarouselTemplate, type CarouselTemplate } from "./template-api.js";
import { clean, type SlideContext, type VNode } from "./templates.js";
import type { Slide } from "./types.js";
import { BUILTIN_TEMPLATES } from "./templates.builtin.js";
import { INSTALLED_TEMPLATES } from "./templates.index.generated.js";

/** The look every unknown/unset style falls back to. */
const FALLBACK_ID = "editorial";

const registry = new Map<string, CarouselTemplate>();
/** Ids that came from BUILTIN_TEMPLATES, so listing can keep them first. */
const builtinIds = new Set<string>();

/**
 * Register a template. Validates its shape (via `defineCarouselTemplate`) and
 * rejects a duplicate id, naming both the template being registered and the one
 * that already owns the id so a pack author can see the collision.
 */
export function registerCarouselTemplate(def: CarouselTemplate): CarouselTemplate {
  const template = defineCarouselTemplate(def);
  const existing = registry.get(template.id);
  if (existing) {
    const origin = builtinIds.has(template.id) ? "built-in" : "installed";
    throw new Error(
      `[carousel-render] cannot register template "${template.id}" (${template.label}): ` +
        `id already registered by ${origin} template "${existing.label}". Template ids must be unique.`,
    );
  }
  registry.set(template.id, template);
  return template;
}

/** Look up a template by id, or `undefined` if none is registered. */
export function getCarouselTemplate(id: string): CarouselTemplate | undefined {
  return registry.get(id);
}

/**
 * All registered templates: builtins first in their canonical registration
 * order, then installed packs sorted alphabetically by id. Use this to populate
 * a style dropdown instead of the deprecated `CAROUSEL_STYLES` constant.
 */
export function listCarouselTemplates(): CarouselTemplate[] {
  const all = [...registry.values()];
  const builtins = all.filter((t) => builtinIds.has(t.id));
  const installed = all
    .filter((t) => !builtinIds.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...builtins, ...installed];
}

/** Unknown ids we've already warned about, so we warn once per distinct id. */
const warnedUnknownIds = new Set<string>();

/**
 * Resolve a style id to a template, falling back to the editorial builtin for an
 * unknown id. Logs exactly one `console.warn` per distinct unknown id.
 */
export function resolveCarouselTemplate(id: string): CarouselTemplate {
  const found = registry.get(id);
  if (found) return found;
  if (!warnedUnknownIds.has(id)) {
    warnedUnknownIds.add(id);
    console.warn(`[carousel-render] unknown style "${id}" — falling back to "${FALLBACK_ID}"`);
  }
  // The editorial builtin is always registered at module load, so this is safe.
  return registry.get(FALLBACK_ID)!;
}

/**
 * Build the Satori vnode for a single slide: sanitize the copy (arrows/emoji →
 * renderable text — the bundled fonts are Latin-only), resolve the deck's style
 * to a template, then dispatch by slide role.
 *
 * Moved here from templates.ts: the sanitization step is byte-for-byte the same;
 * only the old per-style if-chain is replaced by a registry lookup, so visual
 * output is unchanged.
 */
export function slideElement(slide: Slide, ctx: SlideContext): VNode {
  const s: Slide = {
    ...slide,
    headline: clean(slide.headline) || slide.headline,
    body: clean(slide.body),
    kicker: clean(slide.kicker),
    coverStat: clean(slide.coverStat),
  };
  const template = resolveCarouselTemplate(ctx.style ?? FALLBACK_ID);
  if (s.role === "hook") return template.hook(s, ctx);
  if (s.role === "cta") return template.cta(s, ctx);
  return template.body(s, ctx);
}

// Register the builtins first (marking their ids), then any installed packs.
for (const t of BUILTIN_TEMPLATES) {
  builtinIds.add(t.id);
  registerCarouselTemplate(t);
}
for (const t of INSTALLED_TEMPLATES) {
  registerCarouselTemplate(t);
}
