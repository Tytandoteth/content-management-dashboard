/**
 * Turn a registered carousel into X/Twitter drafts - the repurposing bridge that
 * makes our repo/tool listicles work on a platform where links are clickable.
 * For each carousel item id, it reads the stored spec and creates TWO draft
 * ContentItems for A/B testing:
 *   - a "thread": hook tweet + one tweet per repo/tool (with its link) + a CTA
 *   - a "tweet" (single post): hook tweet + one reply carrying all the links
 * The carousel's cover slide rides the first tweet as media.
 *
 *   cd apps/control-plane
 *   pnpm exec tsx scripts/generate-thread.mts <carouselItemId> [<itemId> ...]
 */
import type { CarouselSpec, Slide } from "@cmd/carousel-render";
import { toolUrlFor, noEmDash, BRAND_IDENTITY } from "@cmd/brand";
import { prisma } from "@cmd/db";
import { createContent } from "../src/lib/content-service.js";

const LIMIT = 280;

/**
 * Trim to a tweet-safe length on a word boundary.
 *
 * Only horizontal whitespace is stripped before a newline. (`/\s+\n/` would also
 * match "\n\n" and silently collapse every blank line, which flattened each tweet
 * into an unreadable block — X copy lives on that whitespace.)
 */
function tweet(text: string): string {
  // Every tweet passes through here, so this is the chokepoint for the no-em-dash
  // rule (some of this copy is fetched, not written by us).
  const t = noEmDash(text).replace(/[ \t]+\n/g, "\n").trim();
  if (t.length <= LIMIT) return t;
  const cut = t.slice(0, LIMIT - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
}

/** "195k" from a repo card's stats, when present. */
function starsOf(slide: Slide): string | undefined {
  const stat = slide.card?.stats?.find((s) => /star/i.test(s.label));
  return stat?.value;
}

/** The clickable destination + display for a body slide (repo → GitHub, tool → site). */
function linkOf(slide: Slide): { label: string; url: string } | undefined {
  if (slide.card?.kind === "repo" && slide.card.title) {
    return { label: `github.com/${slide.card.title}`, url: `github.com/${slide.card.title}` };
  }
  if (slide.tool) {
    const u = toolUrlFor(slide.tool);
    if (u) return { label: u.replace(/^https?:\/\//, ""), url: u.replace(/^https?:\/\//, "") };
  }
  return undefined;
}

/**
 * Fit lead + body + CTA into one tweet, trimming ONLY the body. The lead and the
 * CTA are load-bearing (the hook and the bookmark ask), so they must never be the
 * thing the 280-char limit eats.
 */
function fitTweet(lead: string, body: string, cta: string): string {
  const gaps = 4; // two blank lines
  const room = LIMIT - lead.length - cta.length - gaps;
  let b = body.trim();
  if (b.length > room) {
    const cut = b.slice(0, Math.max(0, room - 1));
    const sp = cut.lastIndexOf(" ");
    b = (sp > 0 ? cut.slice(0, sp) : cut).trim().replace(/[,;:]$/, "") + "…";
  }
  return [lead, b, cta].filter(Boolean).join("\n\n").trim();
}

/**
 * hook prose → an X-native opener. Leads with the cover headline (the actual
 * hook), then the paid-tool anchor from the caption, then the bookmark ask.
 *
 * The old version pasted the whole TikTok caption and appended the CTA, so the
 * 280-char truncation swallowed "Bookmark this" and cut off mid-sentence.
 */
function hookTweet(spec: CarouselSpec): string {
  // A deck can hand-write its own X opener (`xHook`) when the auto-composed one
  // isn't sharp enough. The first tweet decides whether the thread gets read, so
  // it's worth being able to hand-tune it per post.
  if (spec.xHook?.trim()) return tweet(spec.xHook.trim());

  const cover = spec.slides.find((s) => s.role === "hook");
  const lead = (cover?.headline ?? spec.topic ?? "").trim().replace(/[.\s]+$/, "") + ".";

  const caption = (spec.caption || "").split(/\n\n/)[0]!.trim();
  // The playbook caption opens by restating the hook ("5 X repos most people are
  // sleeping on, the same tech behind…"). Drop that restatement and start at the
  // paid-tool anchor, which is the part that actually earns the bookmark.
  const anchored = caption.match(/the same tech behind[\s\S]*/i)?.[0] ?? caption;
  const cleaned = anchored
    .replace(/Save this[^.]*\./i, "")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  // Two sentences max: the paid-tool anchor and the price. A third sentence turns
  // the hook into a wall of prose, which is death on X.
  const body = (cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned])
    .slice(0, 2)
    .map((s) => s.trim())
    .join(" ");

  return fitTweet(lead, body, "Bookmark this 🧵");
}

function itemTweets(spec: CarouselSpec): string[] {
  const body = spec.slides.filter((s) => s.role === "body");
  return body.map((s, i) => {
    const link = linkOf(s);
    const stars = starsOf(s);
    const tail = [stars ? `${stars} stars` : null, link?.url].filter(Boolean).join(" → ");
    return tweet(`${i + 1}. ${s.headline}\n\n${s.body ?? ""}\n\n${tail}`);
  });
}

function ctaTweet(spec: CarouselSpec): string {
  const body = spec.slides.filter((s) => s.role === "body");
  const cta = spec.slides.find((s) => s.role === "cta");
  // Numbered (not bulleted) so it mirrors the 1..N of the item tweets above.
  const list = body.map((s, i) => `${i + 1}. ${s.headline}`).join("\n");
  const q = cta?.body ? `\n\n${cta.body}` : "";
  // "open-source" only holds for repo lists; tool round-ups are closed-source.
  const tagline = body.some((s) => s.card?.kind === "repo") ? "All free, all open-source." : "All worth trying.";
  // The last tweet is the only place that converts a reader into a follower, and
  // this is X, so it points at the X account (NOT the TikTok handle).
  const follow = `\n\nFollow ${BRAND_IDENTITY.xHandle} for more of these.`;
  return tweet(`The full stack:\n\n${list}\n\n${tagline}${q}${follow}`);
}

/** Numbered links block for the single-post reply. */
function linksReply(spec: CarouselSpec): string {
  const lines = spec.slides
    .filter((s) => s.role === "body")
    .map((s, i) => {
      const link = linkOf(s);
      return link ? `${i + 1}. ${s.headline} - ${link.url}` : `${i + 1}. ${s.headline}`;
    });
  return tweet(lines.join("\n"));
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.error("usage: tsx scripts/generate-thread.mts <carouselItemId> [<itemId> ...]");
    process.exit(1);
  }
  for (const id of ids) {
    const item = await prisma.contentItem.findUnique({ where: { id } });
    if (!item) { console.warn(`  ⚠ ${id} not found`); continue; }
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const spec = meta.spec as CarouselSpec | undefined;
    if (!spec) { console.warn(`  ⚠ ${id} has no spec`); continue; }

    const cover = (Array.isArray(item.assetUrls) ? (item.assetUrls as string[]) : []).slice(0, 1);
    const hook = hookTweet(spec);
    const items = itemTweets(spec);
    const cta = ctaTweet(spec);

    // A) Full thread: hook + per-item + CTA (follow-ups in payload.thread).
    const threadFollow = [...items, cta];
    const threadItem = await createContent({
      type: "thread",
      brandSurface: "default",
      title: `${item.title} - X thread`,
      payload: { content: hook, thread: threadFollow, engine: "thread_from_carousel", generationMetadata: { sourceItemId: id, topic: spec.topic, spec } } as never,
      assetUrls: cover,
      createdBy: "generate-thread",
      status: "draft",
    });

    // B) Single post: hook tweet + one reply with all the links.
    const postItem = await createContent({
      type: "tweet",
      brandSurface: "default",
      title: `${item.title} - X post`,
      payload: { content: hook, thread: [linksReply(spec)], engine: "post_from_carousel", generationMetadata: { sourceItemId: id, topic: spec.topic, spec } } as never,
      assetUrls: cover,
      createdBy: "generate-thread",
      status: "draft",
    });

    console.log(`  ✓ ${id} → thread ${threadItem.id} (${threadFollow.length + 1} tweets) + post ${postItem.id}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
