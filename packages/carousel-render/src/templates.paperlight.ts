import { BRAND_COLORS as C, BRAND_GRADIENT as G, BRAND_IDENTITY, CAROUSEL_CANVAS } from "@cmd/brand";
import type { Slide, SlideCard } from "./types.js";
import { LOGO_MARK_DATA_URI } from "./logo-asset.js";
import { h, clean, handleOf, type VNode, type SlideContext } from "./templates.js";

/**
 * The "paper-light" starter style — a clean, editorial light-paper look. Cream
 * `BRAND_COLORS.bgLight` canvas, ink `BRAND_COLORS.textOnLight` headlines in Sora
 * 800, thin 2px ink rules as section dividers, a big numbered-list numeral in the
 * primary color per item, and a white repo card with a 2px ink border and a hard
 * offset shadow. A cover photo (`bgImageUrl`) darkens under a scrim with white
 * type, same as editorial. Dispatched when `ctx.style === "paper-light"`.
 */

const DISPLAY = "Sora";
const BODY = "Inter";

const PL = {
  paper: C.bgLight,
  ink: C.textOnLight,
  inkDim: "rgba(26,23,20,0.62)",
  inkFaint: "rgba(26,23,20,0.42)",
  rule: "rgba(26,23,20,0.88)",
  primary: C.primary,
  cardBg: "#ffffff",
  cardBorder: C.textOnLight,
  shadow: "6px 6px 0px rgba(26,23,20,0.12)",
  radius: 20,
};

const safeOf = (ctx: SlideContext) => ({
  top: ctx.safeTop ?? CAROUSEL_CANVAS.safeTop,
  right: ctx.safeRight ?? CAROUSEL_CANVAS.safeRight,
  bottom: ctx.safeBottom ?? CAROUSEL_CANVAS.safeBottom,
  left: ctx.safeLeft ?? CAROUSEL_CANVAS.safeLeft,
});

/** Whether this slide runs in "photo mode": a cover image under a dark scrim
 * (white type). Only hooks carry a cover image; body/cta stay on paper. */
const photoMode = (ctx: SlideContext) => !!ctx.backgroundDataUri;

/** Full-bleed background: flat cream paper, or a cover photo under a scrim. */
function background(ctx: SlideContext): VNode[] {
  const full = { position: "absolute", top: 0, left: 0, width: ctx.width, height: ctx.height } as const;
  if (photoMode(ctx)) {
    return [
      { type: "img", props: { src: ctx.backgroundDataUri, style: { ...full, objectFit: "cover" } } },
      h("div", { ...full, backgroundImage: `linear-gradient(180deg, ${G.scrim[0]}, ${G.scrim[1]})` }),
    ];
  }
  return [
    h("div", { ...full, backgroundColor: PL.paper }),
    h("div", { ...full, backgroundImage: "radial-gradient(120% 60% at 50% -10%, rgba(255,122,26,0.06), transparent 60%)" }),
  ];
}

function root(ctx: SlideContext, children: VNode[]): VNode {
  return h("div", { position: "relative", display: "flex", width: ctx.width, height: ctx.height, backgroundColor: PL.paper, fontFamily: BODY }, children);
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

/** A thin ink section-divider rule. */
function rule(color: string, width: number | string = 96): VNode {
  return h("div", { display: "flex", width, height: 2, backgroundColor: color });
}

/** Top lockup: brand mark (left) + slide counter (right), in ink or white. */
function topBar(ctx: SlideContext, onDark: boolean): VNode {
  const col = onDark ? "#ffffff" : PL.ink;
  return h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
    { type: "img", props: { src: LOGO_MARK_DATA_URI, style: { width: 46, height: 46 } } },
    h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, color: col }, `${ctx.index} / ${ctx.total}`),
  ]);
}

/** Outlined handle chip — mark + @handle inside a rounded ink outline. */
function handleChip(ctx: SlideContext, onDark: boolean): VNode {
  const col = onDark ? "#ffffff" : PL.ink;
  const border = onDark ? "rgba(255,255,255,0.65)" : PL.cardBorder;
  return h(
    "div",
    { display: "flex", alignItems: "center", gap: 12, border: `2px solid ${border}`, borderRadius: 999, padding: "10px 22px 10px 12px" },
    [
      { type: "img", props: { src: LOGO_MARK_DATA_URI, style: { width: 38, height: 38 } } },
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, color: col }, handleOf(ctx)),
    ],
  );
}

function swipe(onDark: boolean): VNode {
  return h("div", { display: "flex", alignItems: "center", fontFamily: BODY, fontSize: 30, fontWeight: 600, color: onDark ? "#ffffff" : PL.ink }, "Swipe »");
}

/** White repo/stat card with a 2px ink border and a hard offset shadow. */
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
          ? h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, color: PL.inkFaint, lineHeight: 1.1 }, owner)
          : h("div", { display: "flex", width: 0, height: 0 }),
        h("div", { display: "flex", fontFamily: DISPLAY, fontSize: name.length > 14 ? 46 : 56, fontWeight: 800, color: PL.ink, lineHeight: 1.05 }, name),
      ]),
      avatarDataUri
        ? h("div", { display: "flex", flexShrink: 0, width: 90, height: 90, borderRadius: 16, overflow: "hidden", border: `2px solid ${PL.cardBorder}`, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }, [
            { type: "img", props: { src: avatarDataUri, style: { width: 90, height: 90, objectFit: "cover" } } },
          ])
        : h("div", { display: "flex", width: 0, height: 0 }),
    ]),
  );

  if (subtitle) {
    rows.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 30, fontWeight: 400, color: PL.inkDim, lineHeight: 1.35, marginTop: 16 }, subtitle));
  }

  if (card.stats && card.stats.length) {
    rows.push(h("div", { display: "flex", width: "100%", marginTop: 26 }, [rule(PL.cardBorder, "100%")]));
    rows.push(
      h(
        "div",
        { display: "flex", flexWrap: "wrap", gap: 36, marginTop: 24 },
        card.stats.slice(0, 4).map((s) =>
          h("div", { display: "flex", flexDirection: "column" }, [
            h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, color: PL.primary, lineHeight: 1 }, clean(s.value) ?? s.value),
            h("div", { display: "flex", fontFamily: BODY, fontSize: 24, fontWeight: 600, color: PL.inkFaint, marginTop: 6 }, clean(s.label) ?? s.label),
          ]),
        ),
      ),
    );
  }

  if (card.languageBar && card.languageBar.length) {
    rows.push(
      h(
        "div",
        { display: "flex", width: "100%", height: 12, marginTop: 26, borderRadius: 999, overflow: "hidden" },
        card.languageBar.map((seg) => h("div", { display: "flex", width: `${Math.max(1, seg.pct)}%`, height: "100%", backgroundColor: seg.color })),
      ),
    );
  }

  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", backgroundColor: PL.cardBg, border: `2px solid ${PL.cardBorder}`, borderRadius: PL.radius, padding: "36px 38px", boxShadow: PL.shadow },
    rows,
  );
}

// ---------------------------------------------------------------------------
// Role renderers
// ---------------------------------------------------------------------------

/** Cover: kicker eyebrow + rule, giant payoff stat (or headline), body. */
export function hookPaperLight(slide: Slide, ctx: SlideContext): VNode {
  const dark = photoMode(ctx);
  const ink = dark ? "#ffffff" : PL.ink;
  const dim = dark ? "rgba(255,255,255,0.82)" : PL.inkDim;
  const ruleC = dark ? "rgba(255,255,255,0.85)" : PL.rule;
  const block: VNode[] = [];

  if (slide.kicker) {
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase", color: PL.primary }, slide.kicker));
    block.push(h("div", { display: "flex", marginTop: 20, marginBottom: 34 }, [rule(ruleC, 120)]));
  }
  if (slide.coverStat) {
    const len = slide.coverStat.length;
    const statSize = len <= 6 ? 210 : len <= 10 ? 158 : 118;
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: statSize, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, color: PL.primary }, slide.coverStat));
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 74, fontWeight: 800, lineHeight: 1.06, color: ink, marginTop: 12 }, slide.headline));
  } else {
    const size = slide.headline.length > 40 ? 80 : 96;
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: size, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1, color: ink }, slide.headline));
  }
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 42, fontWeight: 400, color: dim, lineHeight: 1.4, marginTop: 26 }, slide.body));

  return root(ctx, [
    ...background(ctx),
    content(ctx, [
      topBar(ctx, dark),
      h("div", { display: "flex", flexDirection: "column" }, block),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
        handleChip(ctx, dark),
        ctx.hideSwipeHint ? h("div", { display: "flex" }) : swipe(dark),
      ]),
    ]),
  ]);
}

/** List item: big primary numeral + rule, headline, body, offset-shadow card. */
export function bodyPaperLight(slide: Slide, ctx: SlideContext): VNode {
  const itemNo = ctx.index - 1;
  const block: VNode[] = [
    h("div", { display: "flex", alignItems: "baseline", gap: 22 }, [
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 104, fontWeight: 800, color: PL.primary, lineHeight: 0.9 }, String(itemNo)),
      h("div", { display: "flex", flex: 1, height: 2, backgroundColor: PL.rule, alignSelf: "center" }),
    ]),
  ];
  if (slide.kicker) block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: PL.primary, marginTop: 20 }, slide.kicker));
  block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 66, fontWeight: 800, color: PL.ink, lineHeight: 1.05, marginTop: slide.kicker ? 12 : 22 }, slide.headline));
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 38, fontWeight: 400, color: PL.inkDim, lineHeight: 1.4, marginTop: 20 }, slide.body));
  if (slide.card) block.push(h("div", { display: "flex", width: "100%", marginTop: 34 }, [repoCard(slide.card, ctx.cardAvatarDataUri)]));

  const isLast = ctx.index === ctx.total;
  return root(ctx, [
    ...background(ctx),
    content(ctx, [
      topBar(ctx, false),
      h("div", { display: "flex", flexDirection: "column" }, block),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
        handleChip(ctx, false),
        isLast || ctx.hideSwipeHint ? h("div", { display: "flex" }) : swipe(false),
      ]),
    ]),
  ]);
}

/** CTA: headline + rule + follow line + big handle, outlined chip footer. */
export function ctaPaperLight(slide: Slide, ctx: SlideContext): VNode {
  const block: VNode[] = [];
  if (slide.kicker) {
    block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: PL.primary }, slide.kicker));
    block.push(h("div", { display: "flex", marginTop: 18, marginBottom: 30 }, [rule(PL.rule, 120)]));
  }
  block.push(h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 82, fontWeight: 800, color: PL.ink, lineHeight: 1.05, letterSpacing: -1 }, slide.headline));
  if (slide.body) block.push(h("div", { display: "flex", fontFamily: BODY, fontSize: 42, fontWeight: 500, color: PL.inkDim, lineHeight: 1.35, marginTop: 24 }, slide.body));
  block.push(
    h("div", { display: "flex", flexDirection: "column", marginTop: 50 }, [
      h("div", { display: "flex", fontFamily: BODY, fontSize: 32, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: PL.inkFaint }, "Follow"),
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 84, fontWeight: 800, color: PL.primary, lineHeight: 1.05, marginTop: 8 }, handleOf(ctx)),
    ]),
  );

  return root(ctx, [
    ...background(ctx),
    content(ctx, [
      topBar(ctx, false),
      h("div", { display: "flex", flexDirection: "column" }, block),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
        handleChip(ctx, false),
        h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, color: PL.ink }, BRAND_IDENTITY.ctaLabel),
      ]),
    ]),
  ]);
}
