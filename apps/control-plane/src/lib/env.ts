/**
 * Centralized env access. Reads lazily so the app can boot for UI work even
 * before every integration secret is set; integration calls fail loudly only
 * when actually invoked.
 */
export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  n8nWebhookBase: () => process.env.N8N_WEBHOOK_BASE_URL ?? "",
  controlPlaneApiToken: () => process.env.CONTROL_PLANE_API_TOKEN ?? "",
  postizApiUrl: () => process.env.POSTIZ_API_URL ?? "",
  postizApiKey: () => process.env.POSTIZ_API_KEY ?? "",
  /**
   * Per-brand Postiz channel targets. When a single Postiz account is SHARED
   * across multiple brands, publishing an item with no explicit target must
   * resolve to only ITS brand's channels, never "every connected channel," or
   * content for one brand ends up on another brand's live accounts. (This is
   * exactly the incident that motivated this function: an untargeted publish
   * fanned out across several unrelated brands' live accounts at once.)
   * Comma-separated Postiz integration ids, e.g. POSTIZ_CHANNELS_DEFAULT="ch_1,ch_2".
   */
  postizChannelsForBrand: (brand: string): string[] =>
    (process.env[`POSTIZ_CHANNELS_${brand.toUpperCase()}`] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  // Optional global fallback (legacy / single-brand Postiz accounts only).
  // Prefer postizChannelsForBrand — this applies across ALL brands alike, so
  // it's unsafe on a shared multi-brand account. Never falls back further to
  // "every connected channel"; publishItem throws instead when both are unset.
  postizDefaultIntegrationIds: () =>
    (process.env.POSTIZ_DEFAULT_INTEGRATION_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  // The control plane's own base URL, so it can fetch its rendered slides (served
  // at /carousels/...) and upload the bytes to Postiz.
  appBaseUrl: () => (process.env.APP_BASE_URL ?? "").replace(/\/$/, ""),
  // Public base for resource articles (/r/<slug>), used in comment replies. Falls
  // back to the app base, then a local dev default. Point this at wherever /r is hosted.
  resourceBaseUrl: () =>
    (process.env.RESOURCE_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  // Postiz Cloud strips links from X posts (STRIP_LINKS_FROM_X_POSTS). Default
  // true so we don't emit dangling link-only replies on X; set "false" when
  // self-hosting Postiz with link-stripping OFF so article links post on X.
  postizStripsXLinks: () => (process.env.POSTIZ_STRIPS_X_LINKS ?? "true") !== "false",
  clipperApiUrl: () => process.env.CLIPPER_API_URL ?? "",
  clipperApiKey: () => process.env.CLIPPER_API_KEY ?? "",
  higgsfieldApiUrl: () => process.env.HIGGSFIELD_API_URL ?? "",
  higgsfieldApiKey: () => process.env.HIGGSFIELD_API_KEY ?? "",
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  openrouterApiKey: () => process.env.OPENROUTER_API_KEY ?? "",
  openrouterBaseUrl: () => process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  orchestratorModel: () => process.env.ORCHESTRATOR_MODEL ?? "anthropic/claude-sonnet-5",
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",

  // --- Carousel engine ---------------------------------------------------
  // Where rendered slide PNGs are written so the dashboard can preview them.
  // Defaults to the control-plane app's public dir → served at /carousels/...
  carouselPublicDir: () => process.env.CAROUSEL_PUBLIC_DIR ?? "",
  // When a Vercel Blob token is present, store rendered slides there (serverless
  // hosts can't persist/serve files written to disk at runtime).
  blobConfigured: () => !!process.env.BLOB_READ_WRITE_TOKEN,
  // Where approved carousels are exported as ready-to-post bundles (Phase 4).
  carouselStagingDir: () => process.env.CAROUSEL_STAGING_DIR ?? "",
  // Default number of slides the composer aims for when count is unspecified.
  carouselDefaultSlides: () => Number(process.env.CAROUSEL_DEFAULT_SLIDES ?? "5"),
  // Output resolution multiplier. Default 1 → 1080×1920, the size TikTok's photo
  // API accepts (max 1080p). Higher values exceed TikTok's limit and get rejected.
  carouselRenderScale: () => Number(process.env.CAROUSEL_RENDER_SCALE ?? "1"),
  // Master switch for Phase-2 API auto-publish (Postiz/TikTok). Off by default:
  // approved carousels are staged for manual posting until this is validated.
  autoPublish: () => (process.env.AUTO_PUBLISH ?? "false") === "true",

  // --- TikTok auto-posting (Content Posting API, draft/inbox mode) ----------
  tiktokClientKey: () => process.env.TIKTOK_CLIENT_KEY ?? "",
  tiktokClientSecret: () => process.env.TIKTOK_CLIENT_SECRET ?? "",
  // OAuth redirect; must match the URL registered in the TikTok developer portal.
  tiktokRedirectUri: () => process.env.TIKTOK_REDIRECT_URI ?? "",
  // Public HTTPS base where rendered slides are reachable (TikTok fetches them
  // via PULL_FROM_URL, so localhost won't work). The domain must be verified in
  // the TikTok developer portal. e.g. https://carousels.your-domain.com
  publicBaseUrl: () => (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
};

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}
