/**
 * Render a full carousel from a JSON file — the design harness + batch-render
 * deliverable for the styled carousel system. Supports every style ("editorial",
 * "gradient-pop", "paper-light", "terminal-dev") and both TikTok (9:16) and
 * Instagram (4:5) formats. A slide may carry a `repo: "owner/name"` shorthand;
 * the script expands it into a live GitHub `card` via fetchRepoCard.
 *
 *   cd apps/control-plane
 *   pnpm exec tsx scripts/render-carousel.mts <deck.json> <output-dir>
 *
 * deck.json shape:
 *   {
 *     "style": "terminal-dev" | "gradient-pop" | "paper-light" | "editorial",  // default editorial
 *     "format": "instagram" | "tiktok",                    // default instagram
 *     "topic": "...", "caption": "...", "hashtags": ["#..."],
 *     "slides": [
 *       { "role": "hook", "headline": "7 repos I install...", "bgImageUrl": "..." },
 *       { "role": "body", "headline": "superpowers", "body": "...", "repo": "obra/superpowers" },
 *       { "role": "cta",  "headline": "Save this for your next build", "body": "Which first?" }
 *     ]
 *   }
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCarousel, type CarouselSpec, type CarouselStyle, type Slide } from "@cmd/carousel-render";
import { fetchRepoCard } from "../src/lib/github-card.js";

interface DeckSlide extends Slide {
  /** Shorthand: "owner/name" → fetched into a live GitHub `card`. */
  repo?: string;
}
interface Deck {
  style?: CarouselStyle;
  format?: "tiktok" | "instagram" | "x";
  topic?: string;
  caption?: string;
  hashtags?: string[];
  slides: DeckSlide[];
}

async function main() {
  const jsonPath = process.argv[2];
  const outDir = process.argv[3] ?? "output/carousel";
  if (!jsonPath) {
    console.error("usage: tsx scripts/render-carousel.mts <deck.json> <output-dir>");
    process.exit(1);
  }

  const deck = JSON.parse(await readFile(jsonPath, "utf8")) as Deck;
  const style: CarouselStyle = deck.style ?? "editorial";
  const format = deck.format ?? "instagram";

  // Expand `repo` shorthands into live GitHub cards (tolerant: warn + skip on failure).
  const slides: Slide[] = [];
  for (const s of deck.slides) {
    const { repo, ...slide } = s;
    if (repo && !slide.card) {
      try {
        slide.card = await fetchRepoCard(repo);
        console.log(`  ↳ fetched card for ${repo}`);
      } catch (e) {
        console.warn(`  ⚠ ${repo}: ${(e as Error).message} — rendering without a card`);
      }
    }
    slides.push(slide);
  }

  const spec: CarouselSpec = {
    topic: deck.topic,
    caption: deck.caption ?? "",
    hashtags: deck.hashtags ?? [],
    slides,
  };

  console.log(`Rendering ${slides.length} slides · style=${style} · format=${format}`);
  const rendered = await renderCarousel(spec, { style, format });
  await mkdir(outDir, { recursive: true });
  for (const slide of rendered) {
    const name = `slide-${String(slide.index + 1).padStart(2, "0")}.jpg`;
    await writeFile(join(outDir, name), slide.data);
    console.log(`  ✓ ${join(outDir, name)}`);
  }
  console.log(`Done → ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
