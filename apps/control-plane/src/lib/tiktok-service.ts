import { TikTokClient, type TikTokTokens } from "@cmd/integrations";
import { prisma, type ContentItem, type TikTokConnection } from "@cmd/db";
import { env } from "./env.js";

/**
 * TikTok auto-posting service — the governed path from the control plane to the
 * TikTok Content Posting API. Pushes an approved carousel to the creator's
 * inbox/drafts (post_mode MEDIA_UPLOAD); they tap Post in the app. Stores the
 * Login Kit OAuth tokens and refreshes the access token transparently.
 */

export class TikTokConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TikTokConfigError";
  }
}

export function isTikTokConfigured(): boolean {
  return Boolean(env.tiktokClientKey() && env.tiktokClientSecret() && env.tiktokRedirectUri());
}

export function buildTikTokClient(): TikTokClient {
  if (!isTikTokConfigured()) {
    throw new TikTokConfigError("TikTok is not configured (set TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI)");
  }
  return new TikTokClient({ clientKey: env.tiktokClientKey(), clientSecret: env.tiktokClientSecret() });
}

/** The single connected account (most recent). Null until the creator authorizes. */
export function getConnection(): Promise<TikTokConnection | null> {
  return prisma.tikTokConnection.findFirst({ orderBy: { updatedAt: "desc" } });
}

export async function saveConnection(tokens: TikTokTokens, label?: string): Promise<TikTokConnection> {
  const now = Date.now();
  const data = {
    label: label ?? null,
    scope: tokens.scope,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
    refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
  };
  return prisma.tikTokConnection.upsert({
    where: { openId: tokens.openId },
    create: { openId: tokens.openId, ...data },
    update: data,
  });
}

/** A valid access token, refreshing it (and persisting) if it expires within 2 min. */
export async function getValidAccessToken(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new TikTokConfigError("No TikTok account connected — authorize first");

  if (conn.accessExpiresAt.getTime() - Date.now() > 120_000) return conn.accessToken;

  const refreshed = await buildTikTokClient().refreshAccessToken(conn.refreshToken);
  const saved = await saveConnection({ ...refreshed, openId: conn.openId }, conn.label ?? undefined);
  return saved.accessToken;
}

/** Map a stored asset URL to a public HTTPS URL TikTok can fetch. */
export function toPublicUrl(assetUrl: string): string {
  if (/^https?:\/\//.test(assetUrl)) return assetUrl;
  const base = env.publicBaseUrl();
  if (!base) {
    throw new TikTokConfigError(
      "PUBLIC_BASE_URL is not set — TikTok needs public HTTPS image URLs (PULL_FROM_URL)",
    );
  }
  return `${base}${assetUrl.startsWith("/") ? "" : "/"}${assetUrl}`;
}

export interface TikTokPushResult {
  publishId: string;
  imageCount: number;
}

/**
 * Push an approved carousel to TikTok drafts. Resolves the slide URLs to public
 * URLs, sends the caption as the post title, and returns the publish_id.
 */
export async function pushCarouselDraft(item: ContentItem): Promise<TikTokPushResult> {
  if (item.type !== "carousel") throw new TikTokConfigError("Only carousels can be pushed to TikTok");

  const assetUrls = Array.isArray(item.assetUrls) ? (item.assetUrls as unknown[]) : [];
  const imageUrls = assetUrls
    .filter((u): u is string => typeof u === "string")
    .map(toPublicUrl);
  if (imageUrls.length === 0) throw new TikTokConfigError(`Item ${item.id} has no slide images`);

  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const title = typeof payload.content === "string" && payload.content.trim() ? payload.content : item.title;

  const accessToken = await getValidAccessToken();
  const { publishId } = await buildTikTokClient().postPhotoDraft({
    accessToken,
    title,
    imageUrls,
    coverIndex: 0,
  });
  return { publishId, imageCount: imageUrls.length };
}
