# Deck examples

A **deck** is a JSON file describing one TikTok/Instagram carousel: the hook,
body slides, call-to-action, caption, and hashtags. `scripts/render-carousel.mts`
reads a deck and renders it into a set of branded slide images.

This directory ships three example decks you can render as-is or copy as a
starting point:

| File | Style | What it shows off |
| --- | --- | --- |
| `github-trending-1.json` | `terminal-dev` | GitHub repo cards via the `repo: "owner/name"` shorthand (auto-fetches stars/language/avatar) |
| `npm-gems.json` | `gradient-pop` | Repo cards *plus* a `terminal` panel per slide (rendered as extra prompt/output lines by `terminal-dev`) |
| `mcp-repos.json` | `paper-light` | A simple repo-card listicle with no extra panel content |

## Deck schema

The full type contract lives in
[`packages/carousel-render/src/types.ts`](../../../../packages/carousel-render/src/types.ts)
(`CarouselSpec` / `Slide`). A deck JSON is a superset of `CarouselSpec`: it
adds a couple of render-script-only conveniences (`style`, `format`, and the
`repo` shorthand) that get expanded before the spec is handed to the renderer.

Top-level fields:

- **`style`** *(optional, default `"editorial"`)*: visual theme for every
  slide in the deck. One of `"editorial"`, `"gradient-pop"`, `"paper-light"`,
  `"terminal-dev"`. The three example decks each use a different starter style
  so you can compare them side by side.
- **`format`** *(optional, default `"instagram"`)*: canvas shape.
  `"tiktok"` = 9:16 (1080×1920), `"instagram"` = 4:5 (1080×1350). The example
  decks use `"tiktok"`.
- **`topic`** *(optional)*: a short description of what the carousel is
  about. Echoed into render metadata; not shown on any slide.
- **`caption`**: the post caption (without hashtags).
- **`hashtags`**: array of hashtag strings, e.g. `["#github", "#opensource"]`.
- **`xHook`** *(optional)*: a hand-written opener for an X/Twitter thread
  repurposed from this deck. When omitted, the thread generator composes one
  from the cover headline and caption instead.
- **`slides`**: array of slide objects, in render order (see below).

### Slide fields

Every slide has a `role`: `"hook"` (the scroll-stopping first/cover slide),
`"body"` (a content slide: most of the deck), or `"cta"` (the closing
call-to-action slide).

Common fields (all styles):

- **`role`**: `"hook" | "body" | "cta"` (required).
- **`headline`**: the punchy line (required).
- **`kicker`** *(optional)*: short eyebrow text above the headline.
- **`body`** *(optional)*: the concrete "how" beneath the headline.
- **`bgImageUrl`** *(optional)*: background image URL composited behind the
  branded layer. When omitted, the renderer draws the brand gradient
  instead: so a deck never blocks on image generation. All three example
  decks set this on the hook slide only.
- **`tool`** *(optional)*: a tool/company name (e.g. `"openai.com"`) whose
  logo gets resolved and shown on the slide.
- **`coverStat`** *(optional, hook only)*: a short (≤ ~10 char) hero stat
  like `"$500/mo"` or `"10 hrs"` shown large on the cover.

Repo-card shorthand (render-script only, styled decks):

- **`repo`**: `"owner/name"`, e.g. `"firecrawl/firecrawl"`. Before
  rendering, `render-carousel.mts` fetches the live repo's stars, language,
  description, and avatar from GitHub and expands this into a `card` object
  on the slide. If the fetch fails, the script warns and renders the slide
  without a card rather than failing the whole deck. See all three example
  decks for usage.

The two style-specific fields (`card`, the GitHub repo/stat card, and `terminal`,
a few command/output lines) are documented inline in
[`packages/carousel-render/src/types.ts`](../../../../packages/carousel-render/src/types.ts).
`npm-gems.json` shows `terminal` in use (the `terminal-dev` style renders those
lines as extra prompt/output rows).

## Rendering a deck

From the repo root (`pnpm tsx` loads the root `.env` and runs inside
`apps/control-plane/`, so paths are relative to that app):

```bash
pnpm tsx scripts/render-carousel.mts scripts/decks/<name>.json <output-dir>
```

- `<name>.json`: one of the deck files in this directory (or your own).
- `<output-dir>`: where the rendered slide JPEGs go (defaults to
  `output/carousel` if omitted).

For example:

```bash
pnpm tsx scripts/render-carousel.mts scripts/decks/github-trending-1.json output/github-trending-1
```

This writes `slide-01.jpg`, `slide-02.jpg`, … into the output directory, one
per slide, in deck order.

## Writing your own deck

Copy one of the three example files as a starting point: `github-trending-1.json`
and `mcp-repos.json` are the simplest (hook + repo-card body slides + CTA);
`npm-gems.json` additionally shows the `terminal` panel field. Keep the
`role` ordering intact (one `hook` slide first, `body` slides in the middle,
one `cta` slide last) and validate new fields against
`packages/carousel-render/src/types.ts` before rendering.
