/**
 * Render standalone branded stat cards — not a real carousel, just a few
 * hook-style slides used as video b-roll (e.g. the top-half cutaways in a
 * ty-ai-video DemoVideo `screenSegments` sequence). Numbers land harder as a
 * branded card than as scrolled article text.
 *
 * Edit CARDS below, then:
 *   cd apps/control-plane
 *   pnpm exec tsx scripts/render-stat-cards.mts <output-dir>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCarousel, type CarouselSpec } from "@cmd/carousel-render";

interface CardDef {
  name: string; // output filename (no extension)
  kicker?: string;
  coverStat?: string;
  headline: string;
}

const CARDS: CardDef[] = [
  { name: "govstat1", kicker: "THE AGREEMENT", coverStat: "5 OF 5", headline: "major AI labs now share models with the government" },
  { name: "govstat2", kicker: "NEW EXECUTIVE ORDER", coverStat: "30 DAYS", headline: "of early government access before public release" },
  { name: "govstat3", kicker: "SAME DAY", coverStat: "50 → 200", headline: "orgs given access to Anthropic's Mythos model" },
];

// Matches DemoVideo's top-half slot (TOP_H = 1040 out of a 1080x1920 canvas).
const WIDTH = 1080;
const HEIGHT = 1040;

async function main() {
  const outDir = process.argv[2] ?? "output/stat-cards";
  await mkdir(outDir, { recursive: true });

  const spec: CarouselSpec = {
    topic: "stat cards",
    caption: "",
    hashtags: [],
    slides: CARDS.map((c) => ({ role: "hook", kicker: c.kicker, coverStat: c.coverStat, headline: c.headline })),
  };

  const rendered = await renderCarousel(spec, { width: WIDTH, height: HEIGHT, hideSwipeHint: true, quality: 92 });

  for (let i = 0; i < rendered.length; i++) {
    const card = CARDS[i]!;
    const dest = join(outDir, `${card.name}.jpg`);
    await writeFile(dest, rendered[i]!.data);
    console.log(`✓ ${dest}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
