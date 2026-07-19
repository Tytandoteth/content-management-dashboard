/**
 * The brand kit — ONE source of truth for both the visual layer (carousel
 * renderer) and the editorial layer (AI composer). Every personal/account value
 * is CONFIGURABLE via a `BRAND_*` environment variable with a neutral default,
 * so a fresh clone renders and composes with placeholder identity out of the box
 * and a real deployment overrides only what it needs. See `.env.example` (the
 * "Brand" section) for the full list of vars and defaults.
 *
 * Still pure data — no Node/DOM *imports* — so it's safe to import from server
 * code, the Satori renderer, and the LLM composer alike. Reading `process.env`
 * at module init is a runtime global (not an import) and is only meaningful in
 * Node/server contexts, which is where every consumer of this package runs:
 * the Satori renderer, the LLM composer, Next.js server components / route
 * handlers, and the CLI scripts. The `typeof process` guard below keeps the
 * module from throwing if it is ever accidentally pulled into a browser bundle.
 *
 * CLIENT-BUNDLE NOTE: no "use client" component imports this package (verified
 * by grepping importers during the refactor). The single client-side brand
 * reference — the Wordmark in apps/control-plane/src/components/AppShell.tsx —
 * intentionally reads `NEXT_PUBLIC_BRAND_DISPLAY_NAME` directly instead of
 * importing from here, because non-`NEXT_PUBLIC_` env vars are stripped from
 * client bundles (they would always resolve to the default in the browser).
 * That keeps this package server-oriented and free to use plain `BRAND_*` vars.
 */

/**
 * Read a `BRAND_*` override, trimmed, falling back to a neutral default when the
 * var is unset or blank. Guarded so it never throws in a non-Node context.
 */
function brandEnv(key: string, fallback: string): string {
  const raw = typeof process !== "undefined" ? process.env?.[key] : undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : fallback;
}

/** Canonical account identity. Every field is `BRAND_*`-overridable. */
export const BRAND_IDENTITY = {
  /** The TikTok/Instagram handle. This is the DEFAULT stamped on slides. */
  handle: brandEnv("BRAND_HANDLE", "@yourhandle"),
  displayName: brandEnv("BRAND_DISPLAY_NAME", "Your Brand"),
  tiktokUrl: brandEnv("BRAND_TIKTOK_URL", "https://www.tiktok.com/@yourhandle"),
  /**
   * X/Twitter is a SEPARATE account with a different handle. Anything rendered for
   * X (see `render-x.mts`) must be stamped with this one, otherwise the image tells
   * people to follow a handle that does not exist on that platform.
   */
  xHandle: brandEnv("BRAND_X_HANDLE", "@yourhandle"),
  xUrl: brandEnv("BRAND_X_URL", "https://x.com/yourhandle"),
  /** Link-in-bio hub where every resource/keyword CTA resolves. */
  ctaUrl: brandEnv("BRAND_CTA_URL", "https://example.com/links"),
  ctaLabel: brandEnv("BRAND_CTA_LABEL", "Link in bio"),
  tagline: brandEnv("BRAND_TAGLINE", "Your tagline here"),
} as const;

/**
 * Visual tokens. Hex (not CSS vars) because Satori renders standalone — it has
 * no access to the app's CSS custom properties.
 */
export const BRAND_COLORS = {
  /**
   * The three main accents are `BRAND_*_COLOR`-overridable; the rest of the
   * palette (backgrounds, text ramps) stays fixed — it's a neutral warm scheme
   * that reads well with any accent, and env-ifying every token adds noise
   * without real value. Defaults below are the kit's original orange scheme.
   */
  /** Vivid orange — the primary accent. Hooks, kickers, progress dots, badges. */
  primary: brandEnv("BRAND_PRIMARY_COLOR", "#ff7a1a"),
  /** Warm cream — secondary brand hue. CTA chips, light accents. */
  secondary: brandEnv("BRAND_SECONDARY_COLOR", "#f2e9dc"),
  /** Warm amber — tertiary accent / highlights. */
  accent: brandEnv("BRAND_ACCENT_COLOR", "#ffb066"),
  /** Warm near-black — default slide background base. */
  bgDark: "#0c0a09",
  bgDarkAlt: "#1a1512",
  /** Warm white text on dark. */
  text: "#faf6f0",
  textDim: "rgba(250,246,240,0.72)",
  textFaint: "rgba(250,246,240,0.46)",
  /** Cream surface for inverted slides. */
  bgLight: "#f2e9dc",
  textOnLight: "#1a1714",
} as const;

/** Brand gradient stops used for the fallback background and accents. */
export const BRAND_GRADIENT = {
  /** Light orange → burnt orange diagonal, the signature look. */
  hero: ["#ff9a3d", "#e2541b"] as const,
  /** Orange → deep ember, calmer body accents. */
  cool: ["#ff7a1a", "#b8431a"] as const,
  /** Warm-black base wash so AI backgrounds keep text legible. */
  scrim: ["rgba(12,10,9,0.12)", "rgba(12,10,9,0.86)"] as const,
} as const;

/**
 * Typography. `family` names must match the fonts the renderer loads into
 * Satori (see packages/carousel-render font loader). Weights kept small so the
 * type system reads as confident and modern.
 */
export const BRAND_FONTS = {
  /** Display/headline face — bold, geometric. */
  display: { family: "Sora", weights: [600, 700, 800] as const },
  /** Body face — clean, legible at distance. */
  body: { family: "Inter", weights: [400, 500, 600] as const },
} as const;

/**
 * Carousel canvas. 9:16 (1080×1920) is the confirmed TikTok full-screen frame.
 *
 * TikTok overlays its own UI on photo posts, so key text/CTAs must stay inside
 * the safe area. Research-backed exclusion zones (2025–2026), asymmetric — the
 * bottom (caption + CTA bar) is the deepest, the right is the engagement/follow
 * rail, the top is the username/sound label:
 *   top ~168px · right ~132px · bottom ~340px · left ~96px
 * Net usable region ≈ center 852×1412 — everything important lives there.
 */
export const CAROUSEL_CANVAS = {
  width: 1080,
  height: 1920,
  // Top reserve clears TikTok's status bar + "Following / For You" tab row,
  // which overlay the top of the image (verified against a live in-app post).
  safeTop: 264,
  safeRight: 132,
  safeBottom: 340,
  safeLeft: 96,
  /** Legacy symmetric padding (kept for back-compat). */
  safePadding: 96,
  /**
   * Min/max slides per carousel (TikTok photo mode allows up to 35). Max is 12
   * so a numbered listicle delivers on its promise — "10 prompts" needs hook +
   * 10 body + CTA = 12. Never promise more items than slides.
   */
  minSlides: 3,
  maxSlides: 12,
} as const;

/**
 * Instagram feed carousel canvas. IG crops feed posts to a max 4:5 ratio, so a
 * 9:16 TikTok slide would get its top/bottom chopped — IG needs its own render at
 * 1080×1350 (4:5). IG shows no engagement rail on the image and only a small dot
 * indicator, so the safe zones are near-symmetric padding (no deep right/bottom
 * reserve like TikTok). JPEG, 2–20 images per carousel.
 */
export const INSTAGRAM_CANVAS = {
  width: 1080,
  height: 1350,
  safeTop: 110,
  safeRight: 96,
  safeBottom: 130,
  safeLeft: 96,
  safePadding: 96,
  minSlides: 3,
  maxSlides: 20,
} as const;

/**
 * X / Twitter canvas. X crops single in-timeline images toward 16:9 on desktop
 * and ~5:4 on mobile, so a 9:16 TikTok slide loses its top/bottom in preview. A
 * 1:1 square previews near-fully on every X client and keeps the vertical-ish
 * carousel layout intact — the safest X-native format. 1080×1080, JPEG,
 * up to 4 images per tweet.
 */
export const X_CANVAS = {
  width: 1080,
  height: 1080,
  safeTop: 92,
  safeRight: 96,
  safeBottom: 104,
  safeLeft: 96,
  safePadding: 96,
  minSlides: 3,
  maxSlides: 4,
} as const;

/** Output formats the renderer supports, keyed by platform. */
export const CAROUSEL_FORMATS = {
  tiktok: CAROUSEL_CANVAS,
  instagram: INSTAGRAM_CANVAS,
  x: X_CANVAS,
} as const;

export type CarouselFormat = keyof typeof CAROUSEL_FORMATS;

/**
 * Editorial voice — injected into the composer's system prompt. Describes who
 * the account is and the rules good slide copy follows. Edit here to retune
 * every future carousel at once.
 */
export const BRAND_VOICE = {
  /**
   * The account's persona. The default is the AI-tools-creator voice this kit
   * ships with; override it with `BRAND_VOICE_PERSONA` to retune the composer
   * for a different niche without touching code. The rules/audience below stay
   * fixed — they encode the save-optimized slide structure, not the niche.
   */
  persona: brandEnv(
    "BRAND_VOICE_PERSONA",
    "A sharp, fast-talking AI-tools creator who shows everyday people and creators the exact apps, prompts, and workflows that MAKE them money, SAVE them money, or SAVE them time. Practical over hypey, generous with specifics, always names the real tool and ties it to a dollar or hour outcome.",
  ),
  audience:
    "Creators, founders, side-hustlers, students, and 9-to-5ers who want AI to put money in their pocket or hours back in their week — they want the concrete 'do this, then this', not theory.",
  /** The three outcomes EVERY carousel must ladder up to. */
  outcomes: ["make money", "save money", "save time"] as const,
  rules: [
    "EVERY carousel must tie its tool/workflow to a concrete OUTCOME — make money, save money, or save time. That payoff is the point of the post; the tool is just how you get there.",
    "Slide 1 IS the hook AND the thumbnail — it decides whether anyone swipes. Lead with the outcome in under 1 second: a dollar amount, hours saved, or a 'you're leaving money/time on the table' tension. Use a real number whenever you can. No greetings, no 'in this carousel', no slide title like 'Intro'.",
    "One idea per slide. Headlines are short and punchy (max ~7 words) so they stay legible on a phone; body is at most two short sentences with the concrete how, and where natural, the money or time it saves.",
    "Name the actual tool/feature (Fireflies, Higgsfield, Opus Clips, GPT image, etc.) — specificity is the whole value.",
    "Plain, spoken English. No corporate filler. No emoji and no arrows/symbols in slide text (only the caption may use an emoji).",
    "If the hook promises a count ('5 ways', '7 tools'), deliver EXACTLY that many body slides — one item each. Never promise more than you show; a viewer who's promised 5 and gets 3 bounces.",
    "Final slide is the conversion slide: get them to (1) SAVE the post so they don't lose it, (2) FOLLOW for more money/time-saving AI (give a concrete reason), and (3) COMMENT a simple keyword to get the resource sent to them — this drives comments and triggers the DM funnel.",
    "Never overpromise or fabricate. Don't invent dollar figures or features; if you use a number, keep it realistic and defensible.",
  ],
  /**
   * Default hashtag set — kept to FIVE. TikTok caps hashtags at ~5 (Aug 2025)
   * and 3–5 relevant tags categorize the post best; more dilutes the signal.
   * The composer swaps 1–2 for topic-specific tags (e.g. #opusclips).
   */
  hashtags: ["#aitools", "#ai", "#makemoneywithai", "#productivity", "#sidehustle"],
  /** Caption style guidance for the post body (not the slides). */
  captionStyle:
    "Open by restating the money/time payoff in plain words (this also helps TikTok search). Then one line telling them to SAVE it and COMMENT the keyword to get the guide. Do NOT put hashtags in the caption text — they're added automatically. Tight, no fluff.",
} as const;

export type BrandColors = typeof BRAND_COLORS;
export type BrandGradient = typeof BRAND_GRADIENT;
