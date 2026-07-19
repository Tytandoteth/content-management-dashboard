import { logoDomainFor, logoUrlForTool } from "@cmd/brand";
import type { ContentStatus } from "@cmd/contracts";
import type { CarouselSpec, Slide } from "@cmd/carousel-render";
import { prisma, type ContentItem } from "@cmd/db";

/**
 * The resource/article layer. Every carousel has a companion article on the
 * resource site that lists the exact tools, where to get them, and the
 * step-by-step — so a viewer who saw the post can search the tool or topic and
 * land on a page with clickable links. The article renders directly from the
 * carousel's stored spec, so it's always in sync with the post.
 */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "post";
}

export interface ResourceLink {
  /** Tool/company name as named in the post. */
  name: string;
  /** Where to get it (https://domain), or null if we couldn't resolve a domain. */
  url: string | null;
  /** Logo URL (favicon) for the resource. */
  logo: string | null;
  /** One-line description pulled from the slide that introduced it. */
  blurb?: string;
}

/** The unique tools referenced across a carousel, with links — the "resources". */
export function resourcesFromSpec(spec: CarouselSpec): ResourceLink[] {
  const byKey = new Map<string, ResourceLink>();
  for (const slide of spec.slides) {
    // GitHub repo-card slides carry the link as card.title ("owner/repo") rather
    // than the simple tool-tip `tool` field — without this branch, repo carousels
    // rendered zero resource links at all.
    if (slide.card?.kind === "repo" && slide.card.title?.trim()) {
      const fullName = slide.card.title.trim();
      const key = fullName.toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, {
        name: fullName,
        url: `https://github.com/${fullName}`,
        logo: slide.card.avatarUrl ?? null,
        blurb: slide.card.subtitle?.trim() || slide.body?.trim() || undefined,
      });
      continue;
    }
    const name = slide.tool?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (byKey.has(key)) continue;
    const domain = logoDomainFor(name);
    byKey.set(key, {
      name,
      url: domain ? `https://${domain}` : null,
      logo: logoUrlForTool(name),
      blurb: slide.body?.trim() || undefined,
    });
  }
  return [...byKey.values()];
}

/** Just the body slides (the steps/tips), in order. */
export function stepsFromSpec(spec: CarouselSpec): Slide[] {
  return spec.slides.filter((s) => s.role === "body");
}

export function specFromItem(item: ContentItem): CarouselSpec | null {
  const meta = ((item.payload ?? {}) as Record<string, unknown>).generationMetadata as
    | Record<string, unknown>
    | undefined;
  const spec = meta?.spec as CarouselSpec | undefined;
  return spec && Array.isArray(spec.slides) && spec.slides.length > 0 ? spec : null;
}

export interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  spec: CarouselSpec;
  tools: string[];
}

/** Load every carousel that has a usable spec, as article rows (newest first). */
export async function loadArticles(opts: { publishedOnly?: boolean } = {}): Promise<ArticleRow[]> {
  const where = opts.publishedOnly
    ? { type: "carousel" as const, status: { in: ["approved", "scheduled", "published", "measured"] as ContentStatus[] } }
    : { type: "carousel" as const };
  const items = await prisma.contentItem.findMany({ where, orderBy: { updatedAt: "desc" } });
  const rows: ArticleRow[] = [];
  for (const it of items) {
    const spec = specFromItem(it);
    if (!spec) continue;
    rows.push({
      id: it.id,
      slug: slugify(it.title),
      title: it.title,
      status: it.status,
      spec,
      tools: [...new Set(spec.slides.map((s) => s.tool).filter((t): t is string => !!t))],
    });
  }
  return rows;
}

/** Find one article by slug (slugified title) or by content-item id. */
export async function findArticle(slugOrId: string): Promise<ArticleRow | null> {
  const all = await loadArticles();
  return all.find((a) => a.slug === slugOrId) ?? all.find((a) => a.id === slugOrId) ?? null;
}
