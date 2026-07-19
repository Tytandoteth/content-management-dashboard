/**
 * The public authoring contract for carousel templates (a.k.a. "styles").
 *
 * A template pack — whether one of the four builtins or an installed third-party
 * pack — is just an object implementing `CarouselTemplate`: an id, a label, and
 * one renderer per slide role (hook / body / cta). Author a pack by calling
 * `defineCarouselTemplate({...})` and registering the result.
 *
 * This module is the ONE import a template file needs: it re-exports the whole
 * authoring toolkit (`h`, `clean`, and the `VNode` / `SlideContext` / `Slide` /
 * `SlideCard` / `TerminalPanel` types) so a pack never has to reach into the
 * package internals. Packs consume it via the `@cmd/carousel-render/template-api`
 * subpath export.
 */

// Authoring toolkit — hyperscript builder + text sanitizer.
export { h, clean } from "./templates.js";
// Authoring types re-exported so a pack file needs only this one import.
export type { VNode, SlideContext } from "./templates.js";
export type { Slide, SlideCard, TerminalPanel } from "./types.js";

import type { VNode, SlideContext } from "./templates.js";
import type { Slide } from "./types.js";

/**
 * A pluggable carousel look. Every deck style — the builtins and any installed
 * pack — is one of these. The three role renderers receive already-sanitized
 * slide copy (see `slideElement`) and return a Satori vnode.
 */
export interface CarouselTemplate {
  /** Stable kebab-case id used as the `style` value (e.g. "gradient-pop"). */
  id: string;
  /** Human-facing name for dashboards/dropdowns (e.g. "Gradient Pop"). */
  label: string;
  /** Marks a pack as paid/gated. Purely informational to the registry. */
  premium?: boolean;
  /** Cover / scroll-stopping first slide. */
  hook(slide: Slide, ctx: SlideContext): VNode;
  /** A tip / list-item slide. */
  body(slide: Slide, ctx: SlideContext): VNode;
  /** The closing call-to-action slide. */
  cta(slide: Slide, ctx: SlideContext): VNode;
}

/** kebab-case: lowercase alphanumerics joined by single hyphens, no leading/trailing/double hyphen. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a template's runtime shape and return it unchanged. Throws a
 * `TypeError` with a precise message when a field is wrong — the errors are
 * aimed at pack authors, so they name the offending field and the id.
 */
export function defineCarouselTemplate(def: CarouselTemplate): CarouselTemplate {
  const prefix = "defineCarouselTemplate:";
  if (def === null || typeof def !== "object") {
    throw new TypeError(`${prefix} expected a template object, got ${def === null ? "null" : typeof def}`);
  }
  if (typeof def.id !== "string" || !KEBAB_CASE.test(def.id)) {
    throw new TypeError(
      `${prefix} \`id\` must be a kebab-case string (e.g. "gradient-pop"), got ${JSON.stringify(def.id)}`,
    );
  }
  if (typeof def.label !== "string" || def.label.trim() === "") {
    throw new TypeError(
      `${prefix} template "${def.id}" \`label\` must be a non-empty string, got ${JSON.stringify(def.label)}`,
    );
  }
  for (const role of ["hook", "body", "cta"] as const) {
    if (typeof def[role] !== "function") {
      throw new TypeError(
        `${prefix} template "${def.id}" \`${role}\` must be a function (slide, ctx) => VNode, got ${typeof def[role]}`,
      );
    }
  }
  if (def.premium !== undefined && typeof def.premium !== "boolean") {
    throw new TypeError(
      `${prefix} template "${def.id}" \`premium\` must be a boolean when set, got ${typeof def.premium}`,
    );
  }
  return def;
}
