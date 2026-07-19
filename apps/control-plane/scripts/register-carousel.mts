/**
 * Register an already-rendered `render-carousel.mts` deck into the real content
 * pipeline (so it shows up in the dashboard's Content Library / Board like
 * every other carousel), instead of leaving it as loose files. Re-expands the
 * deck's `repo` shorthands into live GitHub cards so the stored spec matches
 * exactly what was rendered, then creates a draft ContentItem pointing at the
 * already-copied slide files.
 *
 *   cd apps/control-plane
 *   pnpm exec tsx scripts/register-carousel.mts <deck.json> <folderId> <title>
 */
import { readFile } from "node:fs/promises";
import type { CarouselSpec, CarouselStyle, Slide } from "@cmd/carousel-render";
import { toolUrlFor } from "@cmd/brand";
import { fetchRepoCard } from "../src/lib/github-card.js";
import { createContent } from "../src/lib/content-service.js";
import { prisma } from "@cmd/db";

/**
 * The numbered "where to find them" links block that gets appended to every
 * post's social caption — repos link to GitHub, tools to their mapped site.
 * The stored `spec.caption` stays clean prose (the blog uses it); only the
 * social caption (payload.content) carries the links.
 */
export function repoLinksBlock(slides: Slide[]): string {
  const lines: string[] = [];
  let anyRepo = false;
  let n = 0;
  for (const s of slides) {
    if (s.role !== "body") continue;
    if (s.card?.kind === "repo" && s.card.title) {
      anyRepo = true;
      lines.push(`${++n}. ${s.headline} - github.com/${s.card.title}`);
    } else if (s.tool) {
      const url = toolUrlFor(s.tool);
      if (url) lines.push(`${++n}. ${s.headline} - ${url.replace(/^https?:\/\//, "")}`);
    }
  }
  if (!lines.length) return "";
  return `${anyRepo ? "Repos:" : "Links:"}\n${lines.join("\n")}`;
}

interface DeckSlide extends Slide {
  repo?: string;
}
interface Deck {
  style?: CarouselStyle;
  format?: "tiktok" | "instagram";
  topic?: string;
  caption?: string;
  hashtags?: string[];
  /** Hand-written X/Twitter opener. Must reach the stored spec or the thread
   * generator falls back to mangling the TikTok caption into a hook. */
  xHook?: string;
  slides: DeckSlide[];
}

async function main() {
  const [jsonPath, folderId, ...titleParts] = process.argv.slice(2);
  if (!jsonPath || !folderId) {
    console.error("usage: tsx scripts/register-carousel.mts <deck.json> <folderId> <title>");
    process.exit(1);
  }
  const title = titleParts.join(" ") || "Untitled carousel";

  const deck = JSON.parse(await readFile(jsonPath, "utf8")) as Deck;
  const style: CarouselStyle = deck.style ?? "editorial";

  const slides: Slide[] = [];
  for (const s of deck.slides) {
    const { repo, ...slide } = s;
    if (repo && !slide.card) {
      slide.card = await fetchRepoCard(repo);
      console.log(`  ↳ ${repo}`);
    }
    slides.push(slide);
  }

  const spec: CarouselSpec = {
    topic: deck.topic,
    caption: deck.caption ?? "",
    hashtags: deck.hashtags ?? [],
    xHook: deck.xHook,
    slides,
  };

  const files = slides.map((_, i) => `/carousels/${folderId}/slide-${String(i + 1).padStart(2, "0")}.jpg`);
  const caption = [spec.caption, repoLinksBlock(slides), spec.hashtags.join(" ")].filter(Boolean).join("\n\n");

  const item = await createContent({
    type: "carousel",
    brandSurface: "default",
    title,
    payload: {
      content: caption,
      engine: "carousel_composer",
      generationMetadata: { folderId, topic: spec.topic, slideCount: slides.length, style, spec },
    } as never,
    assetUrls: files,
    createdBy: "register-carousel",
    status: "draft",
  });

  console.log(`\n✓ Registered draft ${item.id} — ${slides.length} slides, style=${style}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
