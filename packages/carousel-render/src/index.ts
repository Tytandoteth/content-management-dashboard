export * from "./types.js";
export * from "./render.js";
export * from "./storage.js";
export { loadBrandFonts } from "./fonts.js";
// Template registry: register/list/get styles (builtins + installed packs).
export {
  registerCarouselTemplate,
  listCarouselTemplates,
  getCarouselTemplate,
} from "./registry.js";
// Public authoring contract for template packs.
export { defineCarouselTemplate } from "./template-api.js";
export type { CarouselTemplate } from "./template-api.js";
