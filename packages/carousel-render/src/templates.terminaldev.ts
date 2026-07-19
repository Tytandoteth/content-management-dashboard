import { BRAND_COLORS as C, CAROUSEL_CANVAS } from "@cmd/brand";
import type { Slide, SlideCard, TerminalPanel } from "./types.js";
import { h, clean, handleOf, type VNode, type SlideContext } from "./templates.js";

/**
 * The "terminal-dev" starter style — a dark IDE/terminal look. Every slide is
 * framed as a terminal window: a rounded dark panel with a chrome bar (three
 * traffic-light dots + a mono title "deck.sh - N/T"), then `$` prompt lines in
 * the brand primary followed by output text, all in JetBrains Mono. Repo cards
 * render as a CLI-style summary box; `slide.terminal` lines append as extra
 * prompt/output lines; the CTA ends on a static block cursor. Dispatched from
 * templates.ts when `ctx.style === "terminal-dev"`.
 */

const MONO = "JetBrains Mono";

// Neutral structural GitHub-dark palette (not brand tokens — these are the
// canonical terminal chrome colors). The `$` prompt + accents use brand primary.
const TD = {
  bg: "#0d1117",
  panel: "#161b22",
  chrome: "#1c2129",
  border: "#30363d",
  text: "#e6edf3",
  dim: "#8b949e",
  green: "#3fb950",
  amber: "#d29922",
  dot1: "#ff5f56",
  dot2: "#ffbd2e",
  dot3: "#27c93f",
  primary: C.primary,
};

const safeOf = (ctx: SlideContext) => ({
  top: ctx.safeTop ?? CAROUSEL_CANVAS.safeTop,
  right: ctx.safeRight ?? CAROUSEL_CANVAS.safeRight,
  bottom: ctx.safeBottom ?? CAROUSEL_CANVAS.safeBottom,
  left: ctx.safeLeft ?? CAROUSEL_CANVAS.safeLeft,
});

/** Keep only glyphs the bundled JetBrains Mono subset renders — printable ASCII
 * plus `… » ·`. Symbols (stars, forks, cursor) are drawn, never typed. */
function cleanTerm(s: string): string {
  return Array.from(s)
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return (c >= 0x20 && c <= 0x7e) || c === 0x2026 || c === 0x00bb || c === 0x00b7;
    })
    .join("")
    .trim();
}

/** A small filled star icon as an SVG data URI (font subset has no ★ glyph). */
function starDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2 l2.9 6.3 6.9 .7 -5.2 4.6 1.5 6.8 -6.1 -3.6 -6.1 3.6 1.5 -6.8 -5.2 -4.6 6.9 -.7 Z" fill="${color}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** A small git-fork icon as an SVG data URI (no ⑂ glyph in the subset). */
function forkDataUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="6" cy="5" r="2.4"/><circle cx="18" cy="5" r="2.4"/><circle cx="12" cy="19" r="2.4"/>` +
    `<path d="M6 7.4 V10 a3 3 0 0 0 3 3 h6 a3 3 0 0 0 3-3 V7.4"/><path d="M12 13 v3.6"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Full-bleed IDE background. */
function background(ctx: SlideContext): VNode[] {
  const full = { position: "absolute", top: 0, left: 0, width: ctx.width, height: ctx.height } as const;
  return [
    h("div", { ...full, backgroundColor: TD.bg }),
    h("div", { ...full, backgroundImage: "radial-gradient(70% 45% at 80% 6%, rgba(88,166,255,0.06), transparent 60%)" }),
  ];
}

function root(ctx: SlideContext, children: VNode[]): VNode {
  return h("div", { position: "relative", display: "flex", width: ctx.width, height: ctx.height, backgroundColor: TD.bg, fontFamily: MONO }, children);
}

/** The safe-area content column holding the single terminal-window panel. */
function content(ctx: SlideContext, children: VNode[]): VNode {
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
      paddingTop: safe.top,
      paddingRight: safe.right,
      paddingBottom: safe.bottom,
      paddingLeft: safe.left,
    },
    children,
  );
}

/** The window chrome bar: three traffic-light dots + a centered mono title. */
function chromeBar(ctx: SlideContext): VNode {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dot = (col: string) => h("div", { display: "flex", width: 20, height: 20, borderRadius: 999, backgroundColor: col });
  return h(
    "div",
    { display: "flex", alignItems: "center", width: "100%", padding: "22px 30px", backgroundColor: TD.chrome, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 14, borderBottom: `1.5px solid ${TD.border}` },
    [
      dot(TD.dot1),
      dot(TD.dot2),
      dot(TD.dot3),
      h("div", { display: "flex", flex: 1, justifyContent: "center", fontFamily: MONO, fontSize: 26, fontWeight: 400, color: TD.dim, marginRight: 68 }, `deck.sh - ${pad(ctx.index)}/${pad(ctx.total)}`),
    ],
  );
}

/** A "$ command" prompt line — primary "$" then the command in bright text. */
function promptLine(text: string, size = 34): VNode {
  return h("div", { display: "flex", alignItems: "baseline", gap: 14, width: "100%" }, [
    h("div", { display: "flex", fontFamily: MONO, fontSize: size, fontWeight: 700, color: TD.primary }, "$"),
    h("div", { display: "flex", flex: 1, fontFamily: MONO, fontSize: size, fontWeight: 700, color: TD.text, lineHeight: 1.35 }, cleanTerm(text) || " "),
  ]);
}

/** A plain output line in the given color. */
function outputLine(text: string, color = TD.text, size = 34, weight = 400): VNode {
  return h("div", { display: "flex", fontFamily: MONO, fontSize: size, fontWeight: weight, color, lineHeight: 1.4, width: "100%" }, cleanTerm(text) || " ");
}

/** A static block cursor (no ▍ glyph in the subset — draw it). */
function blockCursor(size: number): VNode {
  return h("div", { display: "flex", width: Math.round(size * 0.5), height: size, backgroundColor: TD.primary, marginLeft: 6 });
}

/** Render `slide.terminal` lines as extra prompt/output rows. */
function terminalLines(term: TerminalPanel): VNode[] {
  const lineColor = (k?: string) =>
    k === "prompt" || k === "accent" ? TD.primary : k === "ok" ? TD.green : k === "warn" ? TD.amber : k === "comment" || k === "muted" ? TD.dim : TD.text;
  return term.lines.map((ln) => {
    if (ln.kind === "prompt") return promptLine(ln.text.replace(/^\$\s*/, ""), 30);
    return outputLine(ln.text, lineColor(ln.kind), 30, ln.kind === "ok" ? 700 : 400);
  });
}

/** CLI-style repo summary box: owner/name bold, description dim, and a stats
 * line ("[star] 12.3k  [fork] 1.2k  [•] TypeScript"). */
function repoCard(card: SlideCard, avatarDataUri?: string): VNode {
  const title = clean(card.title) ?? "";
  const slash = title.lastIndexOf("/");
  const owner = slash > 0 ? title.slice(0, slash + 1) : "";
  const name = slash > 0 ? title.slice(slash + 1) : title;
  const subtitle = clean(card.subtitle);
  const rows: VNode[] = [];

  rows.push(
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 18 }, [
      h("div", { display: "flex", alignItems: "baseline", flex: 1, minWidth: 0, flexWrap: "wrap" }, [
        owner ? h("div", { display: "flex", fontFamily: MONO, fontSize: 40, fontWeight: 400, color: TD.dim }, owner) : h("div", { display: "flex", width: 0, height: 0 }),
        h("div", { display: "flex", fontFamily: MONO, fontSize: 40, fontWeight: 700, color: TD.text }, name),
      ]),
      avatarDataUri
        ? h("div", { display: "flex", flexShrink: 0, width: 72, height: 72, borderRadius: 10, overflow: "hidden", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }, [
            { type: "img", props: { src: avatarDataUri, style: { width: 72, height: 72, objectFit: "cover" } } },
          ])
        : h("div", { display: "flex", width: 0, height: 0 }),
    ]),
  );

  if (subtitle) {
    rows.push(h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 400, color: TD.dim, lineHeight: 1.4, marginTop: 16 }, subtitle));
  }

  // Stats line: star + forks + language dot — icons drawn (font has no glyphs).
  const findStat = (label: string) => card.stats?.find((s) => s.label.toLowerCase() === label);
  const stars = findStat("stars");
  const forks = findStat("forks");
  const statBits: VNode[] = [];
  if (stars) {
    statBits.push(
      h("div", { display: "flex", alignItems: "center", gap: 8 }, [
        { type: "img", props: { src: starDataUri(TD.amber), style: { width: 26, height: 26 } } },
        h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 700, color: TD.text }, clean(stars.value) ?? stars.value),
      ]),
    );
  }
  if (forks) {
    statBits.push(
      h("div", { display: "flex", alignItems: "center", gap: 8 }, [
        { type: "img", props: { src: forkDataUri(TD.dim), style: { width: 26, height: 26 } } },
        h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 700, color: TD.text }, clean(forks.value) ?? forks.value),
      ]),
    );
  }
  const langColor = card.languageBar?.[0]?.color ?? TD.primary;
  const langName = clean(card.language);
  if (langName) {
    statBits.push(
      h("div", { display: "flex", alignItems: "center", gap: 8 }, [
        h("div", { display: "flex", width: 18, height: 18, borderRadius: 999, backgroundColor: langColor }),
        h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 400, color: TD.text }, langName),
      ]),
    );
  }
  if (statBits.length) {
    rows.push(h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 34, marginTop: 22 }, statBits));
  }

  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", backgroundColor: TD.bg, border: `1.5px solid ${TD.border}`, borderRadius: 12, padding: "30px 32px", marginTop: 30 },
    rows,
  );
}

/** Compose one terminal-window slide: chrome bar + a flexing body of rows. */
function windowSlide(ctx: SlideContext, bodyRows: VNode[]): VNode {
  const body = h(
    "div",
    { display: "flex", flexDirection: "column", flexGrow: 1, width: "100%", backgroundColor: TD.panel, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, padding: "44px 42px", gap: 22 },
    bodyRows,
  );
  const panel = h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", height: "100%", border: `1.5px solid ${TD.border}`, borderRadius: 18, overflow: "hidden" },
    [chromeBar(ctx), body],
  );
  return root(ctx, [...background(ctx), content(ctx, [panel])]);
}

// ---------------------------------------------------------------------------
// Role renderers
// ---------------------------------------------------------------------------

/** Cover: a `cat` prompt, the headline as bold output, the cover stat echoed. */
export function hookTerminalDev(slide: Slide, ctx: SlideContext): VNode {
  const rows: VNode[] = [];
  if (slide.kicker) rows.push(outputLine(`# ${slide.kicker}`, TD.dim, 30));
  rows.push(promptLine("cat hook.md"));
  const hlSize = slide.headline.length > 32 ? 60 : 72;
  rows.push(h("div", { display: "flex", fontFamily: MONO, fontSize: hlSize, fontWeight: 700, color: TD.text, lineHeight: 1.12, width: "100%" }, cleanTerm(slide.headline)));
  if (slide.coverStat) {
    rows.push(h("div", { display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }, [
      h("div", { display: "flex", fontFamily: MONO, fontSize: 40, fontWeight: 700, color: TD.dim }, "=>"),
      h("div", { display: "flex", fontFamily: MONO, fontSize: 60, fontWeight: 700, color: TD.primary }, cleanTerm(slide.coverStat)),
    ]));
  }
  if (slide.body) rows.push(outputLine(slide.body, TD.dim, 36));
  // Spacer pushes the swipe prompt to the bottom of the window.
  rows.push(h("div", { display: "flex", flexGrow: 1 }));
  rows.push(
    ctx.hideSwipeHint
      ? promptLine("_", 32)
      : h("div", { display: "flex", alignItems: "center", gap: 14 }, [
          h("div", { display: "flex", fontFamily: MONO, fontSize: 32, fontWeight: 700, color: TD.primary }, "$"),
          h("div", { display: "flex", fontFamily: MONO, fontSize: 32, fontWeight: 400, color: TD.dim }, "swipe »"),
        ]),
  );
  return windowSlide(ctx, rows);
}

/** List item: a step prompt, headline output, body, repo card, terminal lines. */
export function bodyTerminalDev(slide: Slide, ctx: SlideContext): VNode {
  const itemNo = ctx.index - 1;
  const rows: VNode[] = [];
  rows.push(promptLine(`./deck --step ${itemNo}`));
  rows.push(h("div", { display: "flex", fontFamily: MONO, fontSize: slide.headline.length > 22 ? 52 : 60, fontWeight: 700, color: TD.text, lineHeight: 1.1, width: "100%" }, cleanTerm(slide.headline)));
  if (slide.body) rows.push(outputLine(slide.body, TD.dim, 32));
  if (slide.card) rows.push(repoCard(slide.card, ctx.cardAvatarDataUri));
  if (slide.terminal) rows.push(h("div", { display: "flex", flexDirection: "column", width: "100%", gap: 14, marginTop: 8 }, terminalLines(slide.terminal)));
  rows.push(h("div", { display: "flex", flexGrow: 1 }));
  const isLast = ctx.index === ctx.total;
  rows.push(
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, [
      h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 400, color: TD.dim }, handleOf(ctx)),
      isLast || ctx.hideSwipeHint
        ? h("div", { display: "flex" })
        : h("div", { display: "flex", fontFamily: MONO, fontSize: 28, fontWeight: 400, color: TD.dim }, "swipe »"),
    ]),
  );
  return windowSlide(ctx, rows);
}

/** CTA: headline output, then a `follow @handle` line ending on a block cursor. */
export function ctaTerminalDev(slide: Slide, ctx: SlideContext): VNode {
  const rows: VNode[] = [];
  if (slide.kicker) rows.push(outputLine(`# ${slide.kicker}`, TD.dim, 30));
  rows.push(promptLine("cat outro.md"));
  rows.push(h("div", { display: "flex", fontFamily: MONO, fontSize: slide.headline.length > 26 ? 54 : 64, fontWeight: 700, color: TD.text, lineHeight: 1.12, width: "100%" }, cleanTerm(slide.headline)));
  if (slide.body) rows.push(outputLine(slide.body, TD.dim, 36));
  rows.push(h("div", { display: "flex", flexGrow: 1 }));
  rows.push(
    h("div", { display: "flex", alignItems: "center", gap: 14 }, [
      h("div", { display: "flex", fontFamily: MONO, fontSize: 44, fontWeight: 700, color: TD.primary }, "$"),
      h("div", { display: "flex", fontFamily: MONO, fontSize: 44, fontWeight: 700, color: TD.text }, `follow ${handleOf(ctx)}`),
      blockCursor(48),
    ]),
  );
  return windowSlide(ctx, rows);
}
