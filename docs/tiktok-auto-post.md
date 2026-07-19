# Auto-posting carousels to TikTok (draft / inbox mode)

This pushes an **approved** carousel straight to your TikTok **drafts/inbox** via
TikTok's Content Posting API. You then open the TikTok app and tap **Post**. This
mode (`post_mode: MEDIA_UPLOAD`, scope `video.upload`) needs **no app audit**,
unlike fully automatic public posting (`DIRECT_POST`), which requires TikTok to
review your app.

```
approve in dashboard  ->  "Push to TikTok draft"  ->  TikTok inbox notification  ->  you tap Post
```

## The one hard requirement: public image URLs

TikTok photo posts only support `PULL_FROM_URL`: TikTok's servers **fetch** each
slide from a URL, so the rendered slides must be served at a **public HTTPS** URL
on a **domain you have verified** in the TikTok developer portal. `localhost`
will not work; you must deploy the control plane (or serve the slides behind a
verified domain) and set `PUBLIC_BASE_URL`.

## One-time setup

1. **Create a TikTok app** at <https://developers.tiktok.com>, Manage apps,
   Connect:
   - Add the **Login Kit** and **Content Posting API** products.
   - Request the **`video.upload`** scope.
   - Add a **Redirect URI** of exactly `https://<your-domain>/api/tiktok/callback`.
   - Under **URL properties**, **verify the domain** that will host the slide
     images (the one in `PUBLIC_BASE_URL`).
2. **Set env vars** (see `.env.example`):
   - `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
   - `TIKTOK_REDIRECT_URI`, must match the registered URI exactly
   - `PUBLIC_BASE_URL`, e.g. `https://carousels.your-domain.com` (slides resolve
     to `<PUBLIC_BASE_URL>/carousels/<id>/slide-NN.jpg`)
3. **Connect the account**: open **Ready to post** in the dashboard and click
   **Connect TikTok** (or visit `/api/tiktok/auth`). Authorize the TikTok account
   you want to post from. Tokens are stored in the `TikTokConnection` table and
   auto refreshed.

## Posting

- On **Ready to post**, each approved carousel shows **Push to TikTok draft**.
- It returns a `publish_id`; the carousel appears in your TikTok inbox to finish
  and post. Status can be polled via `TikTokClient.getPostStatus`.
- Rate limit: TikTok allows about 6 content-init calls per minute per user token.

Note on format: slides are rendered as **JPEG** (up to 1080p), which is what the
TikTok photo API accepts (JPEG or WebP, not PNG).

## What's implemented vs. external

| Implemented (code) | You must provide (external) |
|---|---|
| OAuth connect + callback (`/api/tiktok/auth`, `/api/tiktok/callback`) | TikTok app + client key/secret |
| Token storage + auto-refresh (`TikTokConnection`, `tiktok-service.ts`) | Domain verification |
| Photo-carousel draft push (`TikTokClient.postPhotoDraft`, `/api/content/:id/push-tiktok`) | Public HTTPS hosting (`PUBLIC_BASE_URL`) |
| "Connect / Push to TikTok" UI on Ready-to-post | Authorizing the account once |

## Going fully automatic (later)

To post on a **schedule with no tap** (`DIRECT_POST`, public): add the
`video.publish` scope, submit the app for **TikTok audit**, then have the
scheduler call a direct-post variant with a `privacy_level`. The existing
`scheduler.ts` cron already walks `approved -> scheduled -> published`; only the
publisher call changes. Until audited, the draft mode above is the supported
path.

---

[Docs index](README.md) · [Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
