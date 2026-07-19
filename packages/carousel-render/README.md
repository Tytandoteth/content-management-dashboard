# @cmd/carousel-render

Branded carousel slides rendered with Satori, resvg, and sharp (JPEG, up to
1080p). Pure compute: a `CarouselSpec` in, slide image bytes out.
Storage, format, and style are decided by the caller.

## Styles
Selected via `RenderOptions.style` (defaults to `"editorial"`):

| Style | Look |
|---|---|
| `editorial` | The original cream and orange, Sora plus Inter look. Money and time tips. |
| `gradient-pop` | Vivid diagonal brand-gradient poster: huge white Sora headlines, a chunky kicker pill, an oversized translucent index numeral, and a glassy translucent-white repo card. |
| `paper-light` | Clean light-paper look: ink headlines on cream, thin 2px ink section rules, big numbered-list numerals in the primary color, and a white repo card with a hard offset shadow. |
| `terminal-dev` | Dark IDE/terminal look: every slide framed as a terminal window (chrome dots plus title bar), `$` prompt and output lines in JetBrains Mono, and a CLI-style repo summary card. |

Every style renders the same `Slide` data and works in both formats
(`tiktok` 1080x1920, `instagram` 1080x1350). The `Slide.card` field (repo or stat
card) is rendered by the three starter styles; `editorial` ignores it. Style is
a render-time concern only, the copy model is identical across styles.

## Rendering a full deck from JSON
`apps/control-plane/scripts/render-carousel.mts` renders a deck file to images.
Run it through the root `tsx` wrapper (loads the root `.env` and runs inside
`apps/control-plane`, so paths resolve there):

```bash
pnpm tsx scripts/render-carousel.mts scripts/decks/mcp-repos.json output/deck
```

Deck JSON schema (`CarouselSpec` plus `style` and `format`, with a per-slide
`repo` shorthand):

```jsonc
{
  "style": "terminal-dev",            // or "gradient-pop" / "paper-light" / "editorial" (default)
  "format": "instagram",              // or "tiktok" (default)
  "topic": "...", "caption": "...", "hashtags": ["#..."],
  "slides": [
    { "role": "hook", "kicker": "Claude Code", "headline": "7 repos I install...",
      "bgImageUrl": "https://... (optional cover photo)" },
    { "role": "body", "headline": "superpowers",
      "body": "A full dev methodology in Claude skills.",
      "repo": "obra/superpowers" },     // shorthand: live GitHub card (stars/forks/etc)
    { "role": "body", "headline": "Custom card", "body": "...",
      "card": { "kind": "repo", "title": "owner/repo", "subtitle": "...",
                "avatarUrl": "...", "stats": [{"label":"Stars","value":"9k"}],
                "languageBar": [{"color":"#3178c6","pct":80},{"color":"#f1e05a","pct":20}] } },
    { "role": "cta", "headline": "Save this for your next build",
      "body": "Which one are you installing first?" }
  ]
}
```

`repo: "owner/name"` is expanded into a live GitHub card via
`apps/control-plane/src/lib/github-card.ts` (`fetchRepoCard`): Contributors,
Issues, Stars, Forks, avatar, and the language color bar. Set `GITHUB_TOKEN` to
raise the rate limit. Hand-authored `card` objects are used as is.

See [`apps/control-plane/scripts/decks/README.md`](../../apps/control-plane/scripts/decks/README.md)
for the full deck format and three example decks.

## Logo
The bundled logo mark is a **neutral placeholder** (a rounded orange square, no
text), defined as a data URI in
[`src/logo-asset.ts`](src/logo-asset.ts) (`LOGO_MARK_DATA_URI`). Swap it for your
own brand mark there. `templates.ts` and `types.ts` note the other places the
mark is referenced.

## From the dashboard
The "New carousel" box has a style dropdown. The chosen style is stored in
`generationMetadata.style` so `rebrand-carousels.mts` re-renders keep it.

## Fonts
Sora (display) plus Inter (body) plus JetBrains Mono (the `terminal-dev` prompts
and stats). Satori has no system-font access, so WOFFs are bundled under
`fonts/` and registered in `fonts.ts`. The bundle is Latin-only: `clean()` maps
arrows to "to" and strips emoji.
