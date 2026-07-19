/**
 * TikTok Content Posting API client (photo carousels, draft/inbox mode).
 *
 * "Draft" mode = post_mode MEDIA_UPLOAD: the carousel is pushed to the creator's
 * TikTok inbox and they finish/publish it in the app. This requires only the
 * `video.upload` scope and NO app audit (unlike DIRECT_POST). Photos must be
 * provided as PULL_FROM_URL — publicly reachable HTTPS URLs on a domain verified
 * in the TikTok developer portal (FILE_UPLOAD for photos is undocumented).
 *
 * Pure HTTP, no SDK; `fetchImpl` is injectable for tests.
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-photo-post
 */

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const CONTENT_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

/** Scope needed for MEDIA_UPLOAD (draft/inbox). DIRECT_POST also needs video.publish. */
export const TIKTOK_DRAFT_SCOPES = ["video.upload"] as const;

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshExpiresIn: number;
  openId: string;
  scope: string;
}

export interface TikTokClientOptions {
  clientKey: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

export class TikTokApiError extends Error {
  constructor(message: string, readonly code?: string, readonly logId?: string) {
    super(message);
    this.name = "TikTokApiError";
  }
}

export class TikTokClient {
  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TikTokClientOptions) {
    this.clientKey = opts.clientKey;
    this.clientSecret = opts.clientSecret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** The URL to send the creator to so they authorize the app (Login Kit). */
  buildAuthorizeUrl(opts: { redirectUri: string; state: string; scopes?: readonly string[] }): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: (opts.scopes ?? TIKTOK_DRAFT_SCOPES).join(","),
      response_type: "code",
      redirect_uri: opts.redirectUri,
      state: opts.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(opts: { code: string; redirectUri: string }): Promise<TikTokTokens> {
    return this.tokenRequest({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code: opts.code,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
    return this.tokenRequest({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(body: Record<string, string>): Promise<TikTokTokens> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.error) {
      throw new TikTokApiError(
        `TikTok token request failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(),
        typeof json.error === "string" ? json.error : undefined,
        typeof json.log_id === "string" ? json.log_id : undefined,
      );
    }
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token),
      expiresIn: Number(json.expires_in ?? 0),
      refreshExpiresIn: Number(json.refresh_expires_in ?? 0),
      openId: String(json.open_id ?? ""),
      scope: String(json.scope ?? ""),
    };
  }

  /**
   * Push a photo carousel to the creator's TikTok inbox as a draft. Returns the
   * publish_id (track with getPostStatus). Caption goes in `title`; TikTok shows
   * it in the editing flow when the creator opens the inbox notification.
   */
  async postPhotoDraft(opts: {
    accessToken: string;
    title: string;
    description?: string;
    imageUrls: string[];
    coverIndex?: number;
  }): Promise<{ publishId: string }> {
    if (opts.imageUrls.length === 0) throw new TikTokApiError("postPhotoDraft: no imageUrls");
    const res = await this.fetchImpl(CONTENT_INIT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        media_type: "PHOTO",
        post_mode: "MEDIA_UPLOAD",
        post_info: {
          title: opts.title.slice(0, 90),
          ...(opts.description ? { description: opts.description.slice(0, 4000) } : {}),
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: opts.imageUrls.slice(0, 35),
          photo_cover_index: opts.coverIndex ?? 0,
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string; log_id?: string };
    };
    if (!res.ok || (json.error && json.error.code && json.error.code !== "ok")) {
      throw new TikTokApiError(
        `TikTok photo post failed: ${json.error?.message ?? res.status}`,
        json.error?.code,
        json.error?.log_id,
      );
    }
    const publishId = json.data?.publish_id;
    if (!publishId) throw new TikTokApiError("TikTok photo post returned no publish_id");
    return { publishId };
  }

  /** Poll the status of a publish_id (e.g. PROCESSING_UPLOAD, SEND_TO_USER_INBOX, FAILED). */
  async getPostStatus(opts: { accessToken: string; publishId: string }): Promise<{ status: string; raw: unknown }> {
    const res = await this.fetchImpl(STATUS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: opts.publishId }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { status?: string }; error?: { message?: string } };
    if (!res.ok) throw new TikTokApiError(`TikTok status fetch failed: ${json.error?.message ?? res.status}`);
    return { status: json.data?.status ?? "UNKNOWN", raw: json };
  }
}
