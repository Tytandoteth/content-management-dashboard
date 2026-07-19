/**
 * Thin typed client for the self-hosted Postiz public API.
 *
 * Design rule (roadmap §7): we drive Postiz through its API and NEVER edit its
 * internals. The moment we hack Postiz's code, every upstream upgrade becomes a
 * merge fight. All custom logic lives in the control plane; Postiz is a subsystem
 * we call. Adding a generator/venue later is one adapter.
 */

export interface PostizClientOptions {
  /** Base URL of the Postiz API, e.g. https://post.your-domain.com/api */
  baseUrl: string;
  /** Postiz API key (from the Postiz settings → API). */
  apiKey: string;
  /** Injected for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SchedulePostInput {
  /** Postiz integration (channel) ids to publish to. */
  integrationIds: string[];
  /** Post text/caption (the first/main tweet). */
  content: string;
  /** Post title (used by providers that have one, e.g. TikTok — max 90 chars). */
  title?: string;
  /** Override TikTok posting method: "UPLOAD" (to drafts) or "DIRECT_POST" (live). */
  tiktokPostingMethod?: "UPLOAD" | "DIRECT_POST";
  /**
   * Follow-up tweets posted as a thread after the main tweet (e.g. a reply
   * carrying the source article link). Each entry is one additional tweet.
   */
  thread?: string[];
  /**
   * External media URLs to attach to the MAIN tweet. They are uploaded to Postiz
   * first (its DTO requires media to live on uploads.postiz.com) and the
   * resulting refs are attached automatically.
   */
  mediaUrls?: string[];
  /**
   * Per-reply media, parallel to `thread`: `threadMedia[i]` is the media URL(s)
   * for reply tweet `i` (same index as `thread[i]`). Absent → replies are
   * text-only (back-compat). Uploaded exactly like `mediaUrls`, and each reply
   * node gets its own `image[]` so a thread can show one image per tweet.
   */
  threadMedia?: string[][];
  /** ISO-8601 publish time. Omit to publish now. */
  scheduledAt?: string;
  /**
   * When true, drop link-bearing thread replies for the X provider — this Postiz
   * instance strips links from X posts (STRIP_LINKS_FROM_X_POSTS), so a link-only
   * reply would publish as a dangling label. Other providers keep the reply.
   */
  stripXLinks?: boolean;
}

/** A media object as returned by Postiz's upload endpoint. */
export interface PostizMedia {
  id: string;
  path: string;
}

export interface SchedulePostResult {
  /** The Postiz post id — stored on ContentItem.postizPostId. */
  postId: string;
  /** Public URL of the published post when Postiz returns one (e.g. the tweet URL). */
  releaseUrl?: string;
  raw: unknown;
}

export type PostizHealth = "ok" | "degraded" | "down";

/**
 * Required per-provider setting defaults for non-draft posts (each provider's
 * DTO validates its own fields). Extend as more channels come online.
 */
const PROVIDER_SETTING_DEFAULTS: Record<string, Record<string, unknown>> = {
  x: { who_can_reply_post: "everyone" },
  tiktok: {
    privacy_level: "PUBLIC_TO_EVERYONE",
    duet: false,
    stitch: false,
    comment: true,
    // Postiz's TikTok DTO requires the string "yes"/"no" here, not a boolean.
    autoAddMusic: "no",
    brand_content_toggle: false,
    brand_organic_toggle: false,
    video_made_with_ai: false,
    // UPLOAD = land in the creator's TikTok inbox/drafts so they add a trending
    // sound and post. DIRECT_POST publishes instantly (no chance to add sound).
    content_posting_method: "UPLOAD",
  },
  // Instagram feed carousel. post_type "post" + 2+ images = carousel. Covers both
  // Facebook-linked ("instagram") and standalone ("instagram-standalone") accounts.
  instagram: { post_type: "post", is_trial_reel: false, collaborators: [] },
  "instagram-standalone": { post_type: "post", is_trial_reel: false, collaborators: [] },
};

export class PostizApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PostizApiError";
  }
}

export class PostizClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PostizClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: this.apiKey,
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    const body = text ? safeJson(text) : null;

    if (!res.ok) {
      const detail = typeof body === "string" ? body : JSON.stringify(body ?? "");
      throw new PostizApiError(
        `Postiz ${init?.method ?? "GET"} ${path} failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
        res.status,
        body,
      );
    }
    return body as T;
  }

  /** List connected channels (Postiz "integrations"). */
  async listChannels(): Promise<unknown> {
    return this.request("/public/v1/integrations");
  }

  /**
   * Upload an external media URL to Postiz and return its {id, path} ref. Postiz
   * rejects foreign media URLs on a post — they must first be uploaded so they
   * live on uploads.postiz.com. Fetches the bytes and POSTs them as multipart.
   */
  async uploadMedia(fileUrl: string): Promise<PostizMedia> {
    const fileRes = await this.fetchImpl(fileUrl, { method: "GET" });
    if (!fileRes.ok) throw new PostizApiError(`fetch media ${fileUrl} failed`, fileRes.status, null);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    const ext = (contentType.split("/")[1] || "bin").split(";")[0];
    const filename = `media.${ext}`;

    // Build a multipart/form-data body with a single "file" field.
    const boundary = `----cmd${Math.random().toString(36).slice(2)}${bytes.length}`;
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);

    const res = await this.fetchImpl(`${this.baseUrl}/public/v1/upload`, {
      method: "POST",
      headers: {
        authorization: this.apiKey,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      throw new PostizApiError(`Postiz upload failed: ${res.status}`, res.status, json);
    }
    const media = json as { id?: string; path?: string };
    if (!media?.id || !media?.path) {
      throw new PostizApiError("Postiz upload returned no id/path", 502, json);
    }
    return { id: media.id, path: media.path };
  }

  /**
   * Upload a set of external media URLs, returning their {id, path} refs. A
   * failed upload is non-fatal (skipped) so one broken image never sinks the
   * post. Empty/absent input → []. Shared by the main tweet and each reply.
   */
  private async uploadSet(urls: string[] | undefined): Promise<Array<{ id: string; path: string }>> {
    const refs: Array<{ id: string; path: string }> = [];
    for (const url of urls ?? []) {
      if (!url) continue;
      try {
        const m = await this.uploadMedia(url);
        refs.push({ id: m.id, path: m.path });
      } catch {
        // Non-fatal: continue without this image.
      }
    }
    return refs;
  }

  /** Public: integrationId → provider identifier ("tiktok", "instagram", …). */
  async providerMap(): Promise<Map<string, string>> {
    const list = (await this.listChannels()) as Array<{ id?: string; identifier?: string }>;
    return new Map((Array.isArray(list) ? list : []).map((c) => [String(c.id), String(c.identifier ?? "")]));
  }

  /** id → provider identifier ("x", "linkedin-page", …), cached per client. */
  private providerByIntegration: Map<string, string> | null = null;
  private async resolveProvider(integrationId: string): Promise<string> {
    if (!this.providerByIntegration) {
      const list = (await this.listChannels()) as Array<{ id?: string; identifier?: string }>;
      this.providerByIntegration = new Map(
        (Array.isArray(list) ? list : []).map((c) => [String(c.id), String(c.identifier ?? "x")]),
      );
    }
    return this.providerByIntegration.get(integrationId) ?? "x";
  }

  /**
   * Schedule (or immediately publish) a post. Returns the Postiz post id so the
   * control plane can store it on the ContentItem and later pull metrics.
   *
   * NOTE: the exact request body shape depends on the pinned Postiz version's
   * public API. This mirrors the v2.11.x `/public/v1/posts` contract; verify
   * against your instance and adjust the mapping in one place if it drifts.
   */
  async schedulePost(input: SchedulePostInput): Promise<SchedulePostResult> {
    // Upload external media to Postiz ONCE (shared across all channels). A
    // failed upload must not sink the post — skip the image and publish text.
    const image = await this.uploadSet(input.mediaUrls);
    // Build reply nodes with their OWN uploaded media (image-per-tweet). Media
    // travels with its reply through the stripXLinks filter below, so dropping a
    // link-only reply also drops its image. Uploads happen once here, then the
    // resulting refs are reused across every channel.
    const replyNodes = await Promise.all(
      (input.thread ?? [])
        .map((content, i) => ({ content, media: input.threadMedia?.[i] }))
        .filter((n) => n.content && n.content.trim())
        .map(async (n) => ({ content: n.content, image: await this.uploadSet(n.media) })),
    );

    // Resolve each channel's provider so settings.__type matches (the API's
    // class-validator discriminator requires it on non-draft posts), plus each
    // provider's required setting defaults. The thread is built PER PROVIDER so
    // X can drop link-only replies that this instance would strip anyway.
    const posts = await Promise.all(
      input.integrationIds.map(async (integrationId) => {
        const provider = await this.resolveProvider(integrationId);
        const providerReplies =
          input.stripXLinks && provider === "x"
            ? replyNodes.filter((n) => !containsUrl(n.content))
            : replyNodes;
        const value = [
          { content: input.content, image },
          ...providerReplies.map((n) => ({ content: n.content, image: n.image })),
        ];
        // TikTok (and any title-bearing provider) gets the post title, ≤90 chars.
        const tiktokOverrides =
          provider === "tiktok"
            ? {
                ...(input.title?.trim() ? { title: input.title.trim().slice(0, 90) } : {}),
                ...(input.tiktokPostingMethod ? { content_posting_method: input.tiktokPostingMethod } : {}),
              }
            : {};
        return {
          integration: { id: integrationId },
          value,
          settings: { __type: provider, ...(PROVIDER_SETTING_DEFAULTS[provider] ?? {}), ...tiktokOverrides },
        };
      }),
    );

    const body = {
      type: input.scheduledAt ? "schedule" : "now",
      // date is required by the DTO even for "now".
      date: input.scheduledAt ?? new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts,
    };

    const result = await this.request<unknown>("/public/v1/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Tolerate both shapes: a single object or an array of created posts.
    const first = (Array.isArray(result) ? result[0] : result) as
      | { id?: string; postId?: string; releaseURL?: string }
      | undefined;
    const postId = first?.id ?? first?.postId;
    if (!postId) {
      throw new PostizApiError("Postiz did not return a post id", 502, result);
    }
    return { postId, releaseUrl: first?.releaseURL, raw: result };
  }

  /**
   * Pull normalized performance metrics for a published post (closes the
   * published → measured loop). Returns a flat key→value map (impressions,
   * likes, reposts, clicks, …). The exact Postiz analytics shape varies by
   * version, so this normalizes a few common shapes and is the single place to
   * adjust if your instance differs. Returns {} when nothing is available.
   */
  async getPostMetrics(postizPostId: string): Promise<Record<string, number>> {
    let raw: unknown;
    try {
      raw = await this.request(`/public/v1/posts/${encodeURIComponent(postizPostId)}/statistics`);
    } catch {
      return {};
    }
    return normalizeMetrics(raw);
  }

  /**
   * Read a post's real delivery state from Postiz (so the control plane only
   * marks "published" once it actually goes out, not when Postiz accepts it).
   * The list endpoint needs a date window; we scan a few days around now.
   */
  async getPostState(postId: string): Promise<{ found: boolean; state?: string; releaseUrl?: string }> {
    const start = new Date(Date.now() - 3 * 86400000).toISOString();
    const end = new Date(Date.now() + 2 * 86400000).toISOString();
    let raw: unknown;
    try {
      raw = await this.request(
        `/public/v1/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
      );
    } catch {
      return { found: false };
    }
    const posts = (Array.isArray(raw) ? raw : ((raw as { posts?: unknown[] })?.posts ?? [])) as Array<{
      id?: string;
      state?: string;
      releaseURL?: string | null;
    }>;
    const p = posts.find((x) => x.id === postId);
    if (!p) return { found: false };
    return { found: true, state: p.state, releaseUrl: p.releaseURL ?? undefined };
  }

  /** Adapter-contract healthcheck (roadmap §3 — generate()/healthcheck()). */
  async healthcheck(): Promise<PostizHealth> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/`, { method: "GET" });
      return res.ok ? "ok" : "degraded";
    } catch {
      return "down";
    }
  }
}

/** True if the text contains an http(s) URL (mirrors Postiz's link detection). */
function containsUrl(text: string): boolean {
  return /https?:\/\/[^\s]+/i.test(text);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Flatten common Postiz analytics shapes into a key→number map. */
function normalizeMetrics(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const src =
    raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).statistics ??
        (raw as Record<string, unknown>).analytics ??
        raw)
      : raw;
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}
