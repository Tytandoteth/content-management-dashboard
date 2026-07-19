/**
 * The four builtin looks, wrapped as `CarouselTemplate` objects and registered
 * ahead of any installed pack (see registry.ts). Each look already ships its
 * role renderers as a trio of functions; here we just bind them to an id/label.
 */

import { defineCarouselTemplate, type CarouselTemplate } from "./template-api.js";
import { hookSlide, bodySlide, ctaSlide } from "./templates.js";
import { hookGradientPop, bodyGradientPop, ctaGradientPop } from "./templates.gradientpop.js";
import { hookPaperLight, bodyPaperLight, ctaPaperLight } from "./templates.paperlight.js";
import { hookTerminalDev, bodyTerminalDev, ctaTerminalDev } from "./templates.terminaldev.js";

/** The original cream/orange look (Sora + Inter). The default + fallback. */
export const editorialTemplate = defineCarouselTemplate({
  id: "editorial",
  label: "Editorial",
  hook: hookSlide,
  body: bodySlide,
  cta: ctaSlide,
});

/** Vivid diagonal-gradient poster look. */
export const gradientPopTemplate = defineCarouselTemplate({
  id: "gradient-pop",
  label: "Gradient Pop",
  hook: hookGradientPop,
  body: bodyGradientPop,
  cta: ctaGradientPop,
});

/** Clean light-paper look. */
export const paperLightTemplate = defineCarouselTemplate({
  id: "paper-light",
  label: "Paper Light",
  hook: hookPaperLight,
  body: bodyPaperLight,
  cta: ctaPaperLight,
});

/** Dark IDE/terminal look. */
export const terminalDevTemplate = defineCarouselTemplate({
  id: "terminal-dev",
  label: "Terminal Dev",
  hook: hookTerminalDev,
  body: bodyTerminalDev,
  cta: ctaTerminalDev,
});

/**
 * Registered first, in this canonical order, so `listCarouselTemplates()` leads
 * with the builtins before any installed pack.
 */
export const BUILTIN_TEMPLATES: CarouselTemplate[] = [
  editorialTemplate,
  gradientPopTemplate,
  paperLightTemplate,
  terminalDevTemplate,
];
