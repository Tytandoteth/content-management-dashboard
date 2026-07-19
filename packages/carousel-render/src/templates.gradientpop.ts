import { BRAND_GRADIENT as G, BRAND_IDENTITY, CAROUSEL_CANVAS } from "@cmd/brand";
import type { Slide, SlideCard } from "./types.js";
import { LOGO_MARK_DATA_URI } from "./logo-asset.js";
import { h, clean, handleOf, type VNode, type SlideContext } from "./templates.js";

/**
 * The "gradient-pop" starter style — a vivid, feed-stopping poster look built
 * entirely from the brand gradient. A diagonal `BRAND_GRADIENT.hero` wash with a
 * soft radial glow, HUGE white Sora headlines, a chunky rounded kicker pill, an
 * oversized translucent "ghost" index numeral, and a glassy translucent-white
 * GitHub repo card. Copy a cover photo (`bgImageUrl`) darkens under a scrim, same
 * as editorial. Dispatched from templates.ts when `ctx.style === "gradient-pop"`.
 */

const DISPLAY = "Sora";
const BODY = "Inter";

const GP = {
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.86)",
  textFaint: "rgba(255,255,255,0.60)",
  ghost: "rgba(255,255,255,0.13)",
  panelBg: "rgba(255,255,255,0.14)",
  panelBorder: "rgba(255,255,255,0.55)",
  radius: 28,
};

const safeOf = (ctx: SlideContext) => ({
  top: ctx.safeTop ?? CAROUSEL_CANVAS.safeTop,
  right: ctx.safeRight ?? CAROUSEL_CANVAS.safeRight,
  bottom: ctx.safeBottom ?? CAROUSEL_CANVAS.safeBottom,
  left: ctx.safeLeft ?? CAROUSEL_CANVAS.safeLeft,
});

/** Full-bleed background: a diagonal brand-gradient wash + soft radial glow, or a
 * cover photo under a dark scrim (same approach as the editorial style). */
function background(ctx: SlideContext): VNode[] {
  const full = { position: "absolute", top: 0, left: 0, width: ctx.width, height: ctx.height } as const;
  const layers: VNode[] = [];
  if (ctx.backgroundDataUri) {
    layers.push({ type: "img", props: { src: ctx.backgroundDataUri, style: { ...full, objectFit: "cover" } } });
    layers.push(h("div", { ...full, backgroundImage: `linear-gradient(180deg, ${G.scrim[0]}, ${G.scrim[1]})` }));
  } else {
    layers.push(h("div", { ...full, backgroundImage: `linear-gradient(150deg, ${G.hero[0]}, ${G.hero[1]})` }));
    layers.push(h("div", { ...full, backgroundImage: "radial-gradient(58% 42% at 78% 12%, rgba(255,255,255,0.34), transparent 60%)" }));
    layers.push(h("div", { ...full, backgroundImage: "radial-gradient(72% 52% at 8% 102%, rgba(255,255,255,0.16), transparent 55%)" }));
  }
  return layers;
}

function root(ctx: SlideContext, children: VNode[]): VNode {
  return h(
    "div",
    { position: "relative", display: "flex", width: ctx.width, height: ctx.height, backgroundColor: G.hero[1], fontFamily: BODY },
    children,
  );
}

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

/** Chunky rounded kicker pill — translucent white on the gradient. */
function kickerPill(text: string): VNode {
  return h(
    "div",
    { display: "flex", alignSelf: "flex-start", alignItems: "center", backgroundColor: "rgba(255,255,255,0.20)", border: "1px solid rgba(255,255,255,0.45)", borderRadius: 999, padding: "12px 28px" },
    [h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: GP.text }, text)],
  );
}

/** Top lockup: brand mark + handle (left), slide counter (right). */
function topBar(ctx: SlideContext): VNode {
  return h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
    h("div", { display: "flex", alignItems: "center", gap: 12 }, [
      { type: "img", props: { src: LOGO_MARK_DATA_URI, style: { width: 48, height: 48 } } },
      h("div", { display: "flex", fontFamily: BODY, fontSize: 30, fontWeight: 600, color: GP.text }, handleOf(ctx)),
    ]),
    h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, color: GP.textDim }, `${ctx.index} / ${ctx.total}`),
  ]);
}

/** Oversized translucent index numeral, floated upper-right behind the content. */
function ghostNumeral(ctx: SlideContext, n: number): VNode {
  const safe = safeOf(ctx);
  return h("div", { position: "absolute", top: Math.max(4, safe.top - 60), right: Math.max(0, safe.right - 30), display: "flex" }, [
    h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 440, fontWeight: 800, color: GP.ghost, lineHeight: 1 }, String(n)),
  ]);
}

function swipe(): VNode {
  // "»" (U+00BB) is in the bundled Latin subset; arrows/triangles are not.
  return h("div", { display: "flex", alignItems: "center", fontFamily: BODY, fontSize: 30, fontWeight: 600, color: GP.text }, "Swipe »");
}

/** Glassy translucent-white repo/stat card: title (owner dim / repo bold),
 * description, bold stats row, optional language bar. */
function repoCard(card: SlideCard, avatarDataUri?: string): VNode {
  const title = clean(card.title) ?? "";
  const slash = title.lastIndexOf("/");
  const owner = slash > 0 ? title.slice(0, slash + 1) : "";
  const name = slash > 0 ? title.slice(slash + 1) : title;
  const subtitle = clean(card.subtitle);
  const rows: VNode[] = [];

  rows.push(
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 20 }, [
      h("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }, [
        owner
          ? h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 34, fontWeight: 700, color: GP.textFaint, lineHeight: 1.1 }, owner)
          : h("div", { display: "flex", width: 0, height: 0 }),
        h("div", { display: "flex", fontFamily: DISPLAY, fontSize: name.length > 14 ? 46 : 58, fontWeight: 800, color: GP.text, lineHeight: 1.05 }, name),
      ]),
      avatarDataUri
        ? h("div", { display: "flex", flexShrink: 0, width: 92, height: 92, borderRadius: 20, overflow: "hidden", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }, [
            { type: "img", props: { src: avatarDataUri, style: { width: 92, height: 92, objectFit: "cover" } } },
          ])
        : h("div", { display: "flex", width: 0, height: 0 }),
    ]),
  );

  if (subtitle) {
    rows.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 30, fontWeight: 400, color: GP.textDim, lineHeight: 1.35, marginTop: 18 }, subtitle));
  }

  if (card.stats && card.stats.length) {
    rows.push(
      h(
        "div",
        { display: "flex", flexWrap: "wrap", gap: 36, marginTop: 28 },
        card.stats.slice(0, 4).map((s) =>
          h("div", { display: "flex", flexDirection: "column" }, [
            h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, color: GP.text, lineHeight: 1 }, clean(s.value) ?? s.value),
            h("div", { display: "flex", fontFamily: BODY, fontSize: 24, fontWeight: 600, color: GP.textFaint, marginTop: 6 }, clean(s.label) ?? s.label),
          ]),
        ),
      ),
    );
  }

  if (card.languageBar && card.languageBar.length) {
    rows.push(
      h(
        "div",
        { display: "flex", width: "100%", height: 12, marginTop: 30, borderRadius: 999, overflow: "hidden" },
        card.languageBar.map((seg) => h("div", { display: "flex", width: `${Math.max(1, seg.pct)}%`, height: "100%", backgroundColor: seg.color })),
      ),
    );
  }

  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", backgroundColor: GP.panelBg, border: `2px solid ${GP.panelBorder}`, borderRadius: GP.radius, padding: "38px 40px" },
    rows,
  );
}

// ---------------------------------------------------------------------------
// Role renderers
// ---------------------------------------------------------------------------

/** Cover: kicker pill, giant payoff stat + hook (or a single huge headline). */
export function hookGradientPop(slide: Slide, ctx: SlideContext): VNode {
  const block: VNode[] = [];
  if (slide.kicker) block.push(h("div", { display: "flex", marginBottom: 26 }, [kickerPill(slide.kicker)]));
  if (slide.coverStat) {
    const len = slide.coverStat.length;
    const statSize = len <= 6 ? 210 : len <= 10 ? 158 : 118;
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: statSize, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, color: GP.text }, slide.coverStat));
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 76, fontWeight: 800, lineHeight: 1.06, color: GP.text, marginTop: 12 }, slide.headline));
  } else {
    const size = slide.headline.length > 40 ? 80 : 96;
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: size, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1, color: GP.text }, slide.headline));
  }
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 42, fontWeight: 400, color: GP.textDim, lineHeight: 1.35, marginTop: 26 }, slide.body));

  return root(ctx, [
    ...background(ctx),
    content(ctx, [
      topBar(ctx),
      h("div", { display: "flex", flexDirection: "column" }, block),
      ctx.hideSwipeHint ? h("div", { display: "flex" }) : swipe(),
    ]),
  ]);
}

/** List item: kicker pill, headline, body, glassy repo card. */
export function bodyGradientPop(slide: Slide, ctx: SlideContext): VNode {
  const itemNo = ctx.index - 1;
  const block: VNode[] = [];
  if (slide.kicker) block.push(h("div", { display: "flex", marginBottom: 22 }, [kickerPill(slide.kicker)]));
  block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 68, fontWeight: 800, color: GP.text, lineHeight: 1.06, letterSpacing: -1 }, slide.headline));
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 38, fontWeight: 400, color: GP.textDim, lineHeight: 1.4, marginTop: 22 }, slide.body));
  if (slide.card) block.push(h("div", { display: "flex", width: "100%", marginTop: 34 }, [repoCard(slide.card, ctx.cardAvatarDataUri)]));

  const isLast = ctx.index === ctx.total;
  return root(ctx, [
    ...background(ctx),
    ghostNumeral(ctx, itemNo),
    content(ctx, [
      topBar(ctx),
      h("div", { display: "flex", flexDirection: "column" }, block),
      isLast || ctx.hideSwipeHint ? h("div", { display: "flex" }) : swipe(),
    ]),
  ]);
}

/** CTA: headline + huge handle + follow prompt with a cream pill. */
export function ctaGradientPop(slide: Slide, ctx: SlideContext): VNode {
  const block: VNode[] = [];
  if (slide.kicker) block.push(h("div", { display: "flex", marginBottom: 24 }, [kickerPill(slide.kicker)]));
  block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 84, fontWeight: 800, color: GP.text, lineHeight: 1.06, letterSpacing: -1 }, slide.headline));
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 42, fontWeight: 500, color: GP.textDim, lineHeight: 1.35, marginTop: 26 }, slide.body));
  block.push(
    h("div", { display: "flex", flexDirection: "column", marginTop: 54 }, [
      h("div", { display: "flex", fontFamily: BODY, fontSize: 32, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: GP.textFaint }, "Follow"),
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 88, fontWeight: 800, color: GP.text, lineHeight: 1.05, marginTop: 8 }, handleOf(ctx)),
      h("div", { display: "flex", alignSelf: "flex-start", alignItems: "center", marginTop: 34, backgroundColor: "#ffffff", borderRadius: 999, padding: "22px 42px" }, [
        h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 36, fontWeight: 700, color: G.hero[1] }, BRAND_IDENTITY.ctaLabel),
      ]),
    ]),
  );

  return root(ctx, [
    ...background(ctx),
    content(ctx, [topBar(ctx), h("div", { display: "flex", flexDirection: "column" }, block), h("div", { display: "flex" })]),
  ]);
}
