import {
  BRAND_COLORS as C,
  BRAND_GRADIENT as G,
  BRAND_IDENTITY,
  CAROUSEL_CANVAS,
} from "@cmd/brand";
import type { CarouselStyle, Slide } from "./types.js";
import { LOGO_MARK_DATA_URI } from "./logo-asset.js";

/**
 * Slide templates rendered with Satori. We emit Satori's plain-object vnode
 * shape (`{ type, props }`) directly so this package needs no JSX/React build —
 * just data in, branded layout out. Three layouts keyed by slide.role.
 */

export type VNode = { type: string; props: Record<string, unknown> };

/** Hyperscript for Satori's plain vnode shape. Exported so the sibling style
 * modules (templates.gradientpop / paperlight / terminaldev) can build slides
 * without JSX. */
export function h(type: string, style: Record<string, unknown>, children?: unknown): VNode {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

export interface SlideContext {
  index: number; // 1-based
  total: number;
  width: number;
  height: number;
  /** Visual style for the deck. Defaults to "editorial" when unset. */
  style?: CarouselStyle;
  /** Resolved background image as a data URI, if any. */
  backgroundDataUri?: string;
  /** Resolved tool logo (social proof) as a data URI, if any. */
  logoDataUri?: string;
  /** Resolved repo/stat-card avatar/logo as a data URI, if any. */
  cardAvatarDataUri?: string;
  /** The tool's domain (e.g. "opus.pro"), shown so viewers see where to get it. */
  toolDomain?: string;
  /** Safe-area insets for this format. Defaults to the TikTok 9:16 zones. */
  safeTop?: number;
  safeRight?: number;
  safeBottom?: number;
  safeLeft?: number;
  /** Hide the "Swipe »" hint — set when a slide is rendered standalone (e.g.
   * a stat-card image for a video cutaway) rather than as part of a real
   * swipeable carousel, where the hint would be meaningless. */
  hideSwipeHint?: boolean;
  /** The @handle to stamp on this slide. X is a separate account from TikTok, so
   * an X render carries its own. Falls back to `BRAND_IDENTITY.handle`. */
  handle?: string;
}

/** The handle for this render: the platform's override, else the TikTok default. */
export const handleOf = (ctx: SlideContext): string => ctx.handle ?? BRAND_IDENTITY.handle;

/** A white rounded tile holding a tool logo (app-icon style) for social proof. */
function logoTile(dataUri: string, size = 96): VNode {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.26),
      backgroundColor: "#ffffff",
      padding: Math.round(size * 0.16),
    },
    [{ type: "img", props: { src: dataUri, style: { width: "100%", height: "100%", objectFit: "contain" } } }],
  );
}

// Safe-area insets default to TikTok's 9:16 zones; a format (e.g. Instagram 4:5)
// can override them per-slide via ctx.
const safeOf = (ctx: SlideContext) => ({
  top: ctx.safeTop ?? CAROUSEL_CANVAS.safeTop,
  right: ctx.safeRight ?? CAROUSEL_CANVAS.safeRight,
  bottom: ctx.safeBottom ?? CAROUSEL_CANVAS.safeBottom,
  left: ctx.safeLeft ?? CAROUSEL_CANVAS.safeLeft,
});

/** Full-bleed background: AI image under a scrim, or the brand gradient. */
function background(ctx: SlideContext, vivid: boolean): VNode[] {
  const layers: VNode[] = [];
  if (ctx.backgroundDataUri) {
    layers.push({
      type: "img",
      props: {
        src: ctx.backgroundDataUri,
        style: { position: "absolute", top: 0, left: 0, width: ctx.width, height: ctx.height, objectFit: "cover" },
      },
    });
    layers.push(
      h("div", {
        position: "absolute",
        top: 0,
        left: 0,
        width: ctx.width,
        height: ctx.height,
        backgroundImage: `linear-gradient(180deg, ${G.scrim[0]}, ${G.scrim[1]})`,
      }),
    );
  } else if (vivid) {
    layers.push(
      h("div", {
        position: "absolute",
        top: 0,
        left: 0,
        width: ctx.width,
        height: ctx.height,
        backgroundImage: `linear-gradient(150deg, ${G.hero[0]}, ${G.hero[1]})`,
      }),
    );
  } else {
    layers.push(
      h("div", {
        position: "absolute",
        top: 0,
        left: 0,
        width: ctx.width,
        height: ctx.height,
        backgroundImage: `linear-gradient(160deg, ${C.bgDarkAlt}, ${C.bgDark})`,
      }),
    );
  }
  return layers;
}

/** The logo mark — a neutral placeholder; swap LOGO_MARK_DATA_URI for your own. */
function brandMark(size = 44): VNode {
  return {
    type: "img",
    props: { src: LOGO_MARK_DATA_URI, style: { width: size, height: size } },
  };
}

/** Top bar: logo mark + handle (the brand lockup, on every slide) + counter. */
function topBar(ctx: SlideContext): VNode {
  return h(
    "div",
    { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
    [
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          gap: 14,
          backgroundColor: "rgba(0,0,0,0.32)",
          padding: "9px 20px 9px 9px",
          borderRadius: 999,
        },
        [
          brandMark(44),
          h(
            "div",
            { display: "flex", fontFamily: "Inter", fontSize: 30, fontWeight: 600, color: C.text },
            handleOf(ctx),
          ),
        ],
      ),
    ],
  );
}

function kicker(text: string, color: string): VNode {
  return h(
    "div",
    {
      display: "flex",
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 600,
      letterSpacing: 6,
      textTransform: "uppercase",
      color,
    },
    text,
  );
}

function root(ctx: SlideContext, children: VNode[]): VNode {
  return h(
    "div",
    {
      position: "relative",
      display: "flex",
      width: ctx.width,
      height: ctx.height,
      backgroundColor: C.bgDark,
      fontFamily: "Inter",
    },
    children,
  );
}

/**
 * The content column, inset to TikTok's safe area so the platform's username
 * (top), engagement rail (right), and caption/CTA bar (bottom) never clip text.
 * Asymmetric padding — the bottom reserve is the deepest.
 */
function content(ctx: SlideContext, children: VNode[], justify = "space-between"): VNode {
  const safe = safeOf(ctx);
  return h(
    "div",
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: ctx.width,
      height: ctx.height,
      display: "flex",
      flexDirection: "column",
      justifyContent: justify,
      paddingTop: safe.top,
      paddingRight: safe.right,
      paddingBottom: safe.bottom,
      paddingLeft: safe.left,
    },
    children,
  );
}

function swipeHint(): VNode {
  // "»" (U+00BB) is in the bundled Latin subset; arrow/triangle glyphs are not.
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      fontFamily: "Inter",
      fontSize: 30,
      fontWeight: 600,
      color: C.text,
    },
    "Swipe »",
  );
}

/** Stable hash so each post deterministically gets one of the cover styles. */
function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

interface CoverTheme {
  bg: VNode[];
  eyebrow: string;
  stat: string;
  headline: string;
}

/**
 * Two cover looks only — bright ORANGE and CREAM — rotated by topic hash so a
 * feed/grid stays varied. We dropped the dark cover: orange and cream covers
 * test best (they pop in-feed); dark ones underperformed. AI background images,
 * when present, still win with white text on a scrim.
 */
function coverTheme(slide: Slide, ctx: SlideContext): CoverTheme {
  if (ctx.backgroundDataUri) {
    return { bg: background(ctx, false), eyebrow: C.primary, stat: C.text, headline: C.text };
  }
  const full = { position: "absolute" as const, top: 0, left: 0, width: ctx.width, height: ctx.height };
  if (strHash(slide.headline) % 2 === 1) {
    // Cream cover — dark text.
    return {
      bg: [h("div", { ...full, backgroundColor: C.bgLight })],
      eyebrow: C.primary,
      stat: C.primary,
      headline: C.textOnLight,
    };
  }
  // Orange gradient — near-black stat for max punch on orange.
  return {
    bg: [h("div", { ...full, backgroundImage: `linear-gradient(150deg, ${G.hero[0]}, ${G.hero[1]})` })],
    eyebrow: C.bgDark,
    stat: C.bgDark,
    headline: C.text,
  };
}

/**
 * The "editorial" builtin trio (hook/body/cta). Wrapped into a CarouselTemplate
 * in templates.builtin.ts and registered as the default + fallback style.
 */
/** Cover = thumbnail: giant payoff stat + punchy hook, no body (legible at grid size). */
export function hookSlide(slide: Slide, ctx: SlideContext): VNode {
  const theme = coverTheme(slide, ctx);
  const block: VNode[] = [];

  if (ctx.logoDataUri) {
    block.push(h("div", { display: "flex", marginBottom: 24 }, [logoTile(ctx.logoDataUri, 104)]));
  }

  if (slide.kicker) {
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Inter", fontSize: 32, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase", color: theme.eyebrow, opacity: 0.85 },
        slide.kicker,
      ),
    );
  }

  if (slide.coverStat) {
    const len = slide.coverStat.length;
    const statSize = len <= 6 ? 220 : len <= 10 ? 168 : 124;
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Sora", fontSize: statSize, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, color: theme.stat, marginTop: 14 },
        slide.coverStat,
      ),
    );
    // Reads as the completion of the stat — tight gap so they're one sentence.
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Sora", fontSize: 70, fontWeight: 700, lineHeight: 1.12, color: theme.headline, marginTop: 10 },
        slide.headline,
      ),
    );
  } else {
    // No stat — the headline is the hero.
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Sora", fontSize: 104, fontWeight: 800, lineHeight: 1.04, color: theme.headline, marginTop: 18 },
        slide.headline,
      ),
    );
  }

  return root(ctx, [
    ...theme.bg,
    content(ctx, [
      topBar(ctx),
      h("div", { display: "flex", flexDirection: "column" }, block),
      ctx.hideSwipeHint
        ? h("div", { display: "flex" })
        : h("div", { display: "flex", alignItems: "center", fontFamily: "Inter", fontSize: 30, fontWeight: 600, color: theme.headline }, "Swipe »"),
    ]),
  ]);
}

export function bodySlide(slide: Slide, ctx: SlideContext): VNode {
  const block: VNode[] = [];
  // Badge: the tool's logo (social proof) when we have one, else the step number.
  block.push(
    h("div", { display: "flex", alignItems: "center", gap: 18, marginBottom: 36 }, [
      ctx.logoDataUri
        ? logoTile(ctx.logoDataUri, 96)
        : h(
            "div",
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 28,
              backgroundImage: `linear-gradient(150deg, ${G.hero[0]}, ${G.hero[1]})`,
              fontFamily: "Sora",
              fontSize: 52,
              fontWeight: 800,
              color: C.text,
            },
            String(ctx.index - 1),
          ),
    ]),
  );
  if (slide.kicker) block.push(kicker(slide.kicker, C.primary));
  block.push(
    h(
      "div",
      { display: "flex", fontFamily: "Sora", fontSize: 72, fontWeight: 700, lineHeight: 1.1, color: C.text, marginTop: slide.kicker ? 20 : 0 },
      slide.headline,
    ),
  );
  if (slide.body) {
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Inter", fontSize: 40, fontWeight: 400, lineHeight: 1.42, color: C.textDim, marginTop: 28 },
        slide.body,
      ),
    );
  }
  // Show where to get the tool, so viewers can see the link even on the slide.
  if (ctx.toolDomain) {
    block.push(
      h(
        "div",
        {
          display: "flex",
          alignSelf: "flex-start",
          alignItems: "center",
          marginTop: 30,
          padding: "12px 22px",
          borderRadius: 999,
          backgroundColor: "rgba(255,122,26,0.14)",
          fontFamily: "Inter",
          fontSize: 32,
          fontWeight: 700,
          color: C.primary,
        },
        `Get it: ${ctx.toolDomain}`,
      ),
    );
  }
  return root(ctx, [
    ...background(ctx, false),
    content(ctx, [
      topBar(ctx),
      h("div", { display: "flex", flexDirection: "column" }, block),
      swipeHint(),
    ]),
  ]);
}

export function ctaSlide(slide: Slide, ctx: SlideContext): VNode {
  const vivid = !ctx.backgroundDataUri;
  const block: VNode[] = [];
  if (slide.kicker) block.push(kicker(slide.kicker, C.text));
  block.push(
    h(
      "div",
      { display: "flex", fontFamily: "Sora", fontSize: 88, fontWeight: 800, lineHeight: 1.06, color: C.text, marginTop: 20 },
      slide.headline,
    ),
  );
  if (slide.body) {
    block.push(
      h(
        "div",
        { display: "flex", fontFamily: "Inter", fontSize: 42, fontWeight: 500, lineHeight: 1.35, color: C.textDim, marginTop: 28 },
        slide.body,
      ),
    );
  }
  // CTA chip.
  block.push(
    h(
      "div",
      {
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
        marginTop: 48,
        padding: "26px 40px",
        borderRadius: 999,
        backgroundColor: C.secondary,
        fontFamily: "Sora",
        fontSize: 38,
        fontWeight: 700,
        color: C.bgDark,
      },
      BRAND_IDENTITY.ctaLabel,
    ),
  );
  return root(ctx, [
    ...background(ctx, vivid),
    content(ctx, [
      topBar(ctx),
      h("div", { display: "flex", flexDirection: "column" }, block),
      h(
        "div",
        { display: "flex", fontFamily: "Inter", fontSize: 34, fontWeight: 600, color: C.text },
        `Follow ${handleOf(ctx)}`,
      ),
    ]),
  ]);
}

/**
 * The bundled fonts cover the Latin subset only — arrows and emoji render as
 * tofu boxes. LLM copy often includes "→" and emoji, so we map arrows to "to"
 * and strip emoji/pictographs from slide text. (Emoji stay in the post caption,
 * which isn't rendered here.)
 */
export function clean(s?: string): string | undefined {
  if (!s) return s;
  const out = s
    .replace(/\s*[←-⇿➔➡⬅⮕]\s*/g, " to ")
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}]/gu,
      "",
    )
    // Strip CJK / Kana / Hangul / fullwidth — our Latin-only fonts render them as
    // tofu boxes. GitHub repo descriptions (card subtitles) are often bilingual,
    // so this keeps only the renderable Latin portion.
    .replace(/[\u{3000}-\u{9FFF}\u{AC00}-\u{D7AF}\u{FF00}-\u{FFEF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

// `slideElement` (style dispatch) now lives in registry.ts, which resolves the
// deck's `style` against the template registry and dispatches by slide role. The
// editorial trio above is registered as the default/fallback template.
