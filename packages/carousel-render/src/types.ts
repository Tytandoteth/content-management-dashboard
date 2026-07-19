/**
 * The contract between the AI composer and the renderer. A `CarouselSpec` is a
 * fully-decided deck — copy + which background each slide uses — that the
 * renderer turns into branded PNGs. Keep this stable; it's also the JSON the
 * composer's LLM is asked to produce.
 */

export type SlideRole = "hook" | "body" | "cta";

/**
 * Visual style for a whole deck — the id of a registered `CarouselTemplate`.
 * Now an open string type: the four builtins ship in the box, but any installed
 * template pack can register a new id, so the style is no longer a closed union.
 * All styles render from the same `Slide` data; style is a render-time concern
 * only — the composer/copy model is identical across styles. Validate/enumerate
 * the available ids at runtime via `listCarouselTemplates()`, not this type.
 */
export type CarouselStyle = string;

/**
 * The four looks that ship builtin, all rendered from the same `Slide` data:
 *  - "editorial" — the original cream/orange look (Sora + Inter). The default.
 *  - "gradient-pop" — a vivid diagonal-gradient poster look: huge white Sora
 *    headlines, a chunky kicker pill, an oversized ghost index numeral, and a
 *    translucent-glass GitHub repo card.
 *  - "paper-light" — a clean light-paper look: ink headlines on cream, thin ink
 *    section rules, big numbered-list numerals, and an offset-shadow repo card.
 *  - "terminal-dev" — a dark IDE/terminal look: every slide framed as a terminal
 *    window (chrome dots + title bar), `$` prompt/output lines in JetBrains Mono,
 *    and a CLI-style repo summary card.
 */
export type BuiltinCarouselStyle = "editorial" | "gradient-pop" | "paper-light" | "terminal-dev";

/**
 * The builtin style ids.
 * @deprecated Only lists the builtins — it can't see installed template packs.
 * Prefer `listCarouselTemplates()` from the registry to enumerate every
 * available style (builtins + packs) for validation or a dashboard dropdown.
 */
export const CAROUSEL_STYLES: readonly BuiltinCarouselStyle[] = [
  "editorial",
  "gradient-pop",
  "paper-light",
  "terminal-dev",
];

/**
 * A structured card shown on a list-item slide — most notably a GitHub repo card
 * (owner/repo, description, avatar, Contributors/Issues/Stars/Forks, language).
 * `kind:"stats"` renders a generic key/value metric card for non-repo topics.
 * Rendered by "gradient-pop", "paper-light", and "terminal-dev"; ignored by
 * "editorial".
 */
export interface SlideCard {
  kind?: "repo" | "stats";
  /** Card heading. For repos: "owner/repo" (the "repo" half is emphasized). */
  title?: string;
  /** One-line description inside the card. */
  subtitle?: string;
  /** Avatar/logo shown in the card (resolved to a data URI at render time). */
  avatarUrl?: string;
  /** The metric row, e.g. [{label:"Stars", value:"215k"}, ...]. */
  stats?: Array<{ label: string; value: string }>;
  /** Dominant language name (e.g. "TypeScript") — the terminal-dev card's CLI
   * summary line shows it beside a colored dot. Optional. */
  language?: string;
  /** Optional GitHub-style language bar: colored segments summing to ~100%. */
  languageBar?: Array<{ color: string; pct: number }>;
}

/**
 * A few lines of command/output text turned into a styled terminal window
 * (traffic-light dots, mono font, per-line coloring). The "terminal-dev" style
 * renders these as extra prompt/output lines; other styles ignore it.
 */
export interface TerminalPanel {
  /** Title-bar caption (e.g. "voice — local"). */
  title?: string;
  /** The lines, each colored by `kind`. */
  lines: Array<{
    text: string;
    /** prompt = orange "$" line, ok = green ✓, warn/comment/muted = dimmed, accent = orange. */
    kind?: "prompt" | "ok" | "warn" | "muted" | "accent" | "comment";
  }>;
}

export interface Slide {
  /** Layout family: the scroll-stopping first slide, a tip slide, or the CTA. */
  role: SlideRole;
  /** Short eyebrow above the headline (tool name, "Step 2", etc.). Optional. */
  kicker?: string;
  /**
   * Hook slides only: the single most thumbnail-worthy payoff, pulled out as the
   * giant hero on the cover — a money or time figure like "$500/mo", "10 hrs",
   * "42 shorts". Short (≤ ~10 chars). When set, the cover leads with this.
   */
  coverStat?: string;
  /** The punchy line. Hook slides especially. */
  headline: string;
  /** The concrete "how" beneath the headline. Optional on hook/CTA. */
  body?: string;
  /**
   * The tool/company this slide is about (e.g. "Opus Clips", "openai.com"). When
   * resolvable, its logo is shown on the slide as social proof.
   */
  tool?: string;
  /**
   * Optional background image (AI-generated or stock) composited behind the
   * branded layer under a dark scrim. When absent the renderer draws the brand
   * gradient — so the pipeline never blocks on image generation.
   */
  bgImageUrl?: string;
  /**
   * Optional structured card for a list-item slide (the GitHub repo card / stat
   * box). When absent, the styled templates fall back to the plain `body` text.
   * Ignored by the "editorial" style.
   */
  card?: SlideCard;
  /**
   * A few command/output lines rendered as an inline terminal panel. Used by the
   * "terminal-dev" style (appended as extra prompt/output lines); ignored by the
   * other styles.
   */
  terminal?: TerminalPanel;
}

export interface CarouselSpec {
  /** What the carousel is about — echoed into render metadata. */
  topic?: string;
  slides: Slide[];
  /** The TikTok post caption (without hashtags). */
  caption: string;
  hashtags: string[];
  /**
   * Optional hand-written opener for the X/Twitter thread. The first tweet decides
   * whether the thread gets read, and a TikTok caption rarely survives the trip, so
   * a deck can override it here. When absent, `generate-thread.mts` composes one
   * from the cover headline + the caption's paid-tool anchor. Ignored by rendering.
   */
  xHook?: string;
}

export interface RenderOptions {
  /**
   * Platform format → canvas size + safe zones. "tiktok" = 9:16 (1080×1920),
   * "instagram" = 4:5 (1080×1350). Defaults to "tiktok". Explicit width/height
   * below still override it.
   */
  format?: "tiktok" | "instagram";
  /** Visual style for the whole deck. Defaults to "editorial" (the original look). */
  style?: CarouselStyle;
  /** Design width in px. Defaults to the format's width (1080). */
  width?: number;
  /** Design height in px. Defaults to the format's height (1920 for TikTok). */
  height?: number;
  /**
   * Output resolution multiplier. Default 1 → exactly 1080×1920, which is what
   * TikTok's photo API accepts (max 1080p). Higher values exceed TikTok's limit.
   */
  scale?: number;
  /** JPEG quality (1–100). Default 90. TikTok photos must be JPEG/WebP, not PNG. */
  quality?: number;
  /** Hide the "Swipe »" hint on hook slides — set when rendering a standalone
   * stat-card image (e.g. video b-roll) rather than a real swipeable carousel. */
  hideSwipeHint?: boolean;
  /**
   * Override the @handle stamped on the slides. Each platform is its own account:
   * TikTok/Instagram use `BRAND_IDENTITY.handle`, X uses `BRAND_IDENTITY.xHandle`.
   * A render for X must carry the X handle, or the image points people at a
   * handle that doesn't exist there. Defaults to `BRAND_IDENTITY.handle`.
   */
  handle?: string;
}

export interface RenderedSlide {
  index: number;
  role: SlideRole;
  /** Image bytes for this slide (JPEG). */
  data: Uint8Array;
  /** File extension without the dot (e.g. "jpg"). */
  ext: string;
}
