# Branding

Make the studio yours. Every brand value is env driven with neutral placeholder
defaults, so a fresh clone renders and composes out of the box, and nothing
personal ships until you set it. This page covers the `BRAND_*` env vars, the two
logo placeholders you replace, and the one command that regenerates your whole
visual identity.

## Brand env vars

All of these live in the `# BRAND` section of `.env.example` and are consumed by
`@cmd/brand`, the single source of truth for both the carousel renderer and the AI
composer. Set them in the root `.env`.

| Variable | Default | What it sets |
|---|---|---|
| `BRAND_HANDLE` | `@yourhandle` | Your TikTok handle, stamped on slides. |
| `BRAND_DISPLAY_NAME` | `Your Brand` | Display name used in copy. |
| `NEXT_PUBLIC_BRAND_DISPLAY_NAME` | `Your Brand` | Client mirror for the dashboard sidebar wordmark. |
| `BRAND_TIKTOK_URL` | placeholder | Your TikTok profile URL. |
| `BRAND_X_HANDLE` / `BRAND_X_URL` | `@yourhandle` | Your X account (a separate account; X renders and threads use these). |
| `BRAND_CTA_URL` / `BRAND_CTA_LABEL` | placeholder / `Link in bio` | Where CTA slides resolve, and the chip label. |
| `BRAND_TAGLINE` | `Your tagline here` | Your one-line tagline. |
| `BRAND_PRIMARY_COLOR` | `#ff7a1a` | Primary accent (hex). |
| `BRAND_SECONDARY_COLOR` | `#f2e9dc` | Secondary accent (hex). |
| `BRAND_ACCENT_COLOR` | `#ffb066` | Tertiary accent (hex). |
| `BRAND_VOICE_PERSONA` | built-in persona | The AI copywriter's voice. See [connect-your-agent.md](connect-your-agent.md). |

Only the three main accents are overridable through env; the rest of the palette
derives from them. The composer's audience, outcome rules, and save-optimized slide
structure stay fixed because they encode the format, not the niche. Only the persona
is env driven.

## The two logo placeholders

Two image assets ship as neutral placeholders you replace with your own:

- `apps/control-plane/public/logo.png`, the dashboard wordmark.
- `packages/carousel-render/src/logo-asset.ts`, the carousel renderer's mark.

Fonts also live in `@cmd/brand` (`packages/carousel-render/src/fonts.ts` loads
them). Swap those files to change the mark and typeface.

## Regenerate your visual identity

Once your `BRAND_*` colors are set, regenerate the project's brand assets with the
same Satori plus resvg plus sharp engine that renders your carousel slides:

```bash
pnpm tsx ../../packages/carousel-render/scripts/render-brand-assets.mts
```

`pnpm tsx` runs inside `apps/control-plane`, so the `../../` prefix resolves the
script from the repo root. It reads your brand kit and writes:

| Output | Size | Purpose |
|---|---|---|
| `.github/assets/hero-banner.png` | 1600x480 | README hero banner. |
| `.github/assets/social-preview.png` | 1280x640 | GitHub social preview (upload it under repo Settings). |
| `apps/control-plane/public/logo.png` | 512 | Dashboard logo. |
| `apps/control-plane/public/logo-mark.png` | 512 | Square mark. |
| `apps/control-plane/src/app/icon.png` | 192 | Favicon. |
| `apps/control-plane/src/app/apple-icon.png` | 180 | iOS icon. |

The banner title and tagline can be overridden with `BANNER_TITLE` and
`BANNER_TAGLINE` if you want copy different from the defaults.

---

[Docs index](README.md) · [Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
