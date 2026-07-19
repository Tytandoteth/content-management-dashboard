import type { PostizClient, SchedulePostResult } from "@cmd/integrations";
import { env } from "./env.js";

/**
 * The single, governed path from the control plane to Postiz.
 *
 * Nothing else calls Postiz's publish API directly — this is the chokepoint the
 * Phase-1 gate protects, so "real publishing is opt-in and a human confirms"
 * (roadmap §2) holds by construction. Postiz is driven only via its API; we
 * never touch its internals.
 */

/** Minimal shape this service needs from a ContentItem (keeps it DB-agnostic). */
export interface PublishableItem {
  id: string;
  title: string;
  payload: Record<string, unknown>;
  assetUrls: unknown;
  scheduledAt: Date | null;
  /** Which brand this item belongs to — resolves its Postiz channels. Required
   * for the brand-mapping fallback; omit only if the item always carries
   * explicit payload.integrationIds. */
  brandSurface?: string;
  /** Content type — routes text posts (thread/tweet/post) to X and image posts
   * (carousel/video) to TikTok/Instagram, so the two never cross. */
  type?: string;
}

export interface PublishedPost {
  postId: string;
  provider: string;
  /** The channel ids this post was sent to (one format group). */
  integrationIds: string[];
}

export interface PublishFailure {
  provider: string;
  integrationIds: string[];
  message: string;
}

export interface PublishOutcome {
  /** First created post id (back-compat). */
  postizPostId: string;
  platforms: string[];
  /** Live URL of the published post, when Postiz returns one. */
  releaseUrl?: string;
  /** Posts created THIS call (one per format group). */
  posts: PublishedPost[];
  /** Format groups whose schedulePost call itself failed (no post created). */
  failures: PublishFailure[];
  /** Channels skipped because they already have a delivered post for this item. */
  skipped: string[];
}

export class PublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishConfigError";
  }
}

/**
 * Map a content item to a Postiz schedule call and execute it.
 *
 * Reads channel targets and caption from the item's payload:
 *  - `payload.integrationIds: string[]` — Postiz channel ids (required)
 *  - `payload.content: string`         — caption (falls back to the title)
 *  - `payload.platforms: string[]`     — platform labels for the published event
 *  - `item.assetUrls: string[]`        — media to attach
 */
export async function publishItem(
  item: PublishableItem,
  client: PostizClient,
): Promise<PublishOutcome> {
  const payload = item.payload ?? {};

  // Resolve target channels: explicit on the item → this item's brand's
  // configured channels → a legacy global default. NEVER falls back further to
  // "every connected channel" — this Postiz account may be shared across
  // brands, so an unresolved target must fail loudly rather than fan out to
  // unrelated brands' live social accounts.
  let integrationIds = Array.isArray(payload.integrationIds)
    ? (payload.integrationIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (integrationIds.length === 0 && item.brandSurface) {
    integrationIds = env.postizChannelsForBrand(item.brandSurface);
  }
  if (integrationIds.length === 0) integrationIds = env.postizDefaultIntegrationIds();
  if (integrationIds.length === 0) {
    throw new PublishConfigError(
      `No Postiz channel configured for item ${item.id} (brand: ${item.brandSurface ?? "unknown"}). ` +
        `Set payload.integrationIds, or POSTIZ_CHANNELS_${(item.brandSurface ?? "BRAND").toUpperCase()} ` +
        `to that brand's Postiz channel id(s) — this account has channels for multiple brands, so ` +
        `publishing never guesses by falling back to all of them.`,
    );
  }

  const content =
    typeof payload.content === "string" && payload.content.trim()
      ? payload.content
      : item.title;

  // Slides are served at /carousels/...; make them absolute so Postiz's upload
  // (which fetches the bytes from us) can reach them.
  const base = env.appBaseUrl();
  const absolutize = (urls: unknown): string[] =>
    (Array.isArray(urls) ? (urls as unknown[]) : [])
      .filter((u): u is string => typeof u === "string")
      .map((u) => (u.startsWith("/") && base ? `${base}${u}` : u));

  // TikTok uses the 9:16 slides; Instagram needs its 4:5 variant (rendered into
  // payload.generationMetadata.instagram) so feed carousels don't get cropped.
  const tiktokMedia = absolutize(item.assetUrls);
  const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
  const igMedia = absolutize(meta.instagram);

  const thread = Array.isArray(payload.thread)
    ? (payload.thread as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  // TikTok photo posts carry a title; use the topic (payload.title or the item title).
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : item.title;

  // Skip channels that already have a delivered post for this item, so a retry
  // (e.g. after one platform failed) never duplicates the platform that worked.
  const alreadyPosted = Array.isArray(payload.postedIntegrationIds)
    ? (payload.postedIntegrationIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const skipped = integrationIds.filter((id) => alreadyPosted.includes(id));
  const targetIds = integrationIds.filter((id) => !alreadyPosted.includes(id));

  // Group target channels by format: Instagram (4:5) vs everything else (9:16),
  // because Postiz attaches one media set per post — so each format is its own post.
  let providerOf = new Map<string, string>();
  try {
    providerOf = await client.providerMap();
  } catch {
    /* if this fails, treat all as non-IG (9:16) */
  }
  const providerName = (id: string) => providerOf.get(id) ?? "tiktok";
  const isIg = (id: string) => providerName(id).startsWith("instagram");
  const isX = (id: string) => { const p = providerName(id); return p === "x" || p.startsWith("twitter"); };
  const igIds = targetIds.filter(isIg);
  const xIds = targetIds.filter(isX);
  const imageOtherIds = targetIds.filter((id) => !isIg(id) && !isX(id)); // tiktok et al.

  // Route by content type so the two worlds never cross: text posts
  // (thread/tweet/post) go to X and carry their copy in content + thread;
  // image posts (carousel/video) go to TikTok/Instagram with the slide media.
  const isTextPost = item.type === "thread" || item.type === "tweet" || item.type === "post";

  const groups: Array<{ provider: string; ids: string[]; mediaUrls: string[]; threadMedia?: string[][]; missingMedia?: boolean }> = [];
  if (isTextPost) {
    if (!xIds.length) {
      throw new PublishConfigError(
        `Item ${item.id} is a ${item.type} but none of its Postiz channels are X/Twitter. ` +
          `Connect X in Postiz and add its integration id to POSTIZ_CHANNELS_${(item.brandSurface ?? "BRAND").toUpperCase()}.`,
      );
    }
    if (item.type === "thread" && thread.length && tiktokMedia.length > 1) {
      // Image-per-tweet: cover slide on the lead tweet, then one slide per reply
      // (slide order matches the thread copy). Reply i with no slide → text-only.
      const [lead, ...rest] = tiktokMedia;
      const threadMedia = thread.map((_, i) => (rest[i] ? [rest[i]!] : []));
      groups.push({ provider: "x", ids: xIds, mediaUrls: lead ? [lead] : [], threadMedia });
    } else {
      // Single tweet/post (or a thread with only a cover): up to 4 images on the
      // lead tweet, replies text-only — the original behavior.
      groups.push({ provider: "x", ids: xIds, mediaUrls: tiktokMedia.slice(0, 4) });
    }
  } else {
    if (imageOtherIds.length) groups.push({ provider: providerName(imageOtherIds[0]!), ids: imageOtherIds, mediaUrls: tiktokMedia });
    if (igIds.length) groups.push({ provider: providerName(igIds[0]!), ids: igIds, mediaUrls: igMedia, missingMedia: igMedia.length < 2 });
  }

  const platforms = Array.isArray(payload.platforms) ? (payload.platforms as string[]) : [];
  const posts: PublishedPost[] = [];
  const failures: PublishFailure[] = [];

  // Each group posts INDEPENDENTLY — one platform failing must not abort the rest.
  for (const g of groups) {
    if (g.missingMedia) {
      failures.push({ provider: g.provider, integrationIds: g.ids, message: "no 4:5 Instagram slides rendered — run scripts/render-instagram.mts" });
      continue;
    }
    try {
      const res: SchedulePostResult = await client.schedulePost({
        integrationIds: g.ids,
        content,
        title,
        thread,
        mediaUrls: g.mediaUrls,
        threadMedia: g.threadMedia,
        scheduledAt: item.scheduledAt?.toISOString(),
        stripXLinks: env.postizStripsXLinks(),
      });
      posts.push({ postId: res.postId, provider: g.provider, integrationIds: g.ids });
    } catch (err) {
      failures.push({ provider: g.provider, integrationIds: g.ids, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { postizPostId: posts[0]?.postId ?? "", platforms, releaseUrl: undefined, posts, failures, skipped };
}
