/**
 * Render the project's brand assets (logo mark, README banner, social preview)
 * with the SAME engine that renders carousel slides: Satori + resvg + sharp.
 *
 * Everything derives from the configurable brand kit, so after you set your
 * own BRAND_* env vars you can regenerate the whole visual identity:
 *
 *   pnpm tsx ../../packages/carousel-render/scripts/render-brand-assets.mts
 *
 * Outputs:
 *   .github/assets/hero-banner.png           1600x480  README hero
 *   .github/assets/social-preview.png   1280x640  GitHub social preview (upload in repo Settings)
 *   apps/control-plane/public/logo.png       512  dashboard logo
 *   apps/control-plane/public/logo-mark.png  512  square mark
 *   apps/control-plane/src/app/icon.png      192  favicon
 *   apps/control-plane/src/app/apple-icon.png 180 iOS icon
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { BRAND_COLORS as C, BRAND_GRADIENT as G, BRAND_IDENTITY } from "@cmd/brand";
import { loadBrandFonts } from "../src/fonts.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const NAME = process.env.BANNER_TITLE ?? "Content Management Dashboard";
const TAGLINE =
  process.env.BANNER_TAGLINE ??
  "Open-source AI carousel studio. Claude writes, Satori renders, you approve.";
const CHIPS = ["NEXT.JS", "CLAUDE API", "SATORI", "POSTGRES", "MIT"];

// ---------------------------------------------------------------------------
// Logo mark: pure SVG geometry (no fonts) — a slide deck with an approved card.
// ---------------------------------------------------------------------------
function markSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G.hero[0]}"/>
      <stop offset="1" stop-color="${G.hero[1]}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#g)"/>
  <rect x="212" y="122" width="196" height="268" rx="26" fill="none"
        stroke="rgba(255,255,255,0.5)" stroke-width="14" transform="rotate(6 310 256)"/>
  <rect x="126" y="122" width="196" height="268" rx="26" fill="${C.text}"
        transform="rotate(-4 224 256)"/>
  <g transform="rotate(-4 224 256)">
    <rect x="158" y="162" width="118" height="22" rx="11" fill="${G.hero[1]}"/>
    <rect x="158" y="204" width="92" height="15" rx="7.5" fill="rgba(226,84,27,0.4)"/>
    <rect x="158" y="234" width="106" height="15" rx="7.5" fill="rgba(226,84,27,0.4)"/>
    <circle cx="264" cy="336" r="34" fill="${G.hero[1]}"/>
    <path d="M248 336 l12 12 l22 -24" stroke="${C.text}" stroke-width="11"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Satori vnode helpers (same plain-object shape the slide templates use).
// ---------------------------------------------------------------------------
type VNode = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): VNode => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});

function chip(label: string): VNode {
  return h(
    "div",
    {
      display: "flex",
      padding: "7px 16px",
      borderRadius: 999,
      border: `1.5px solid rgba(255,122,26,0.45)`,
      color: C.accent,
      fontFamily: "JetBrains Mono",
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: 2,
    },
    label,
  );
}

function bannerNode(w: number, hgt: number, markUri: string, vertical: boolean): VNode {
  const wordmark = h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: vertical ? "center" : "flex-start",
      gap: 14,
    },
    [
      h(
        "div",
        {
          fontFamily: "Sora",
          fontWeight: 800,
          fontSize: vertical ? 58 : 62,
          color: C.text,
          letterSpacing: -1.5,
          textAlign: vertical ? "center" : "left",
        },
        NAME,
      ),
      h(
        "div",
        {
          fontFamily: "Inter",
          fontWeight: 400,
          fontSize: vertical ? 24 : 25,
          color: C.textDim,
          textAlign: vertical ? "center" : "left",
        },
        TAGLINE,
      ),
      h(
        "div",
        { display: "flex", flexDirection: "row", gap: 12, marginTop: 10 },
        CHIPS.map(chip),
      ),
    ],
  );
  const mark: VNode = {
    type: "img",
    props: {
      src: markUri,
      width: vertical ? 148 : 168,
      height: vertical ? 148 : 168,
      style: { borderRadius: 34 },
    },
  };
  return h(
    "div",
    {
      width: w,
      height: hgt,
      display: "flex",
      flexDirection: vertical ? "column" : "row",
      alignItems: "center",
      justifyContent: "center",
      gap: vertical ? 30 : 52,
      backgroundColor: C.bgDark,
      backgroundImage: "radial-gradient(120% 85% at 50% -12%, rgba(255,122,26,0.14), transparent 60%)",
    },
    [mark, wordmark],
  );
}

// ---------------------------------------------------------------------------
async function svgToPng(svg: string, width: number): Promise<Buffer> {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}

async function renderNodePng(node: VNode, w: number, hgt: number, scale = 1): Promise<Buffer> {
  const fonts = await loadBrandFonts();
  const svg = await satori(node as never, { width: w, height: hgt, fonts });
  return svgToPng(svg, Math.round(w * scale));
}

const assetsDir = join(REPO_ROOT, ".github", "assets");
const publicDir = join(REPO_ROOT, "apps", "control-plane", "public");
const appDir = join(REPO_ROOT, "apps", "control-plane", "src", "app");
await mkdir(assetsDir, { recursive: true });

const markDataUri = `data:image/svg+xml;base64,${Buffer.from(markSvg(512)).toString("base64")}`;

const jobs: Array<[string, Promise<Buffer>]> = [
  [join(assetsDir, "hero-banner.png"), renderNodePng(bannerNode(1600, 480, markDataUri, false), 1600, 480)],
  [join(assetsDir, "social-preview.png"), renderNodePng(bannerNode(1280, 640, markDataUri, true), 1280, 640)],
  [join(publicDir, "logo.png"), svgToPng(markSvg(512), 512)],
  [join(publicDir, "logo-mark.png"), svgToPng(markSvg(512), 512)],
  [join(appDir, "icon.png"), svgToPng(markSvg(512), 192)],
  [join(appDir, "apple-icon.png"), svgToPng(markSvg(512), 180)],
];
for (const [path, buf] of jobs) {
  const data = await buf;
  const optimized = await sharp(data).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path, optimized);
  console.log(`  ✓ ${path.replace(REPO_ROOT + "/", "")} (${Math.round(optimized.length / 1024)}KB)`);
}
console.log(`Done. Brand: ${BRAND_IDENTITY.displayName} / primary ${C.primary}`);
