# Operator scripts

These are the command line tools that drive the carousel pipeline outside the
dashboard: render decks, register them into the content library, cross post to
X and Instagram, and seed data. They live in `apps/control-plane/scripts/*.mts`.

## How to run them

Use the root `tsx` wrapper. From the repo root:

```bash
pnpm tsx scripts/<name>.mts [args]
```

That wrapper (`package.json`, the `tsx` script) does two things for you: it
loads the root `.env` via `dotenv-cli` (so `DATABASE_URL`, any AI key, and
`GITHUB_TOKEN` are present), and it runs inside `apps/control-plane`, so paths
like `scripts/decks/...`, `public/carousels/...`, and `output/...` resolve
relative to that app. You do not need to `cd` anywhere or export env by hand.

Prerequisites vary by script:

- **DB**: scripts that read or write content need the dev database up
  (`pnpm db:up`, `pnpm db:migrate`) and `DATABASE_URL` set.
- **AI key**: scripts that call the composer (`generate-trends`,
  `recompose-carousels`) write real copy only with `OPENROUTER_API_KEY` or
  `ANTHROPIC_API_KEY`; without one they use the deterministic stub. See
  [connect-your-agent.md](connect-your-agent.md).
- **`GITHUB_TOKEN`**: optional, only for scripts that fetch live GitHub repo
  cards (`render-carousel`, `register-carousel`). Raises the GitHub API rate
  limit; the fetch works unauthenticated but is rate limited.

## The main workflow: render, register, cross post

The end to end path for a hand authored deck is render, then register, then
optionally cross post to other platforms.

### 1. Render a deck to images

```bash
pnpm tsx scripts/render-carousel.mts <deck.json> [output-dir]
```

Renders a deck JSON into branded slide JPEGs. Supports both formats (TikTok
9:16, Instagram 4:5) and all four styles. A slide may carry a `repo: "owner/name"`
shorthand, which the script expands into a live GitHub card. `output-dir`
defaults to `output/carousel`. See the [deck format](../apps/control-plane/scripts/decks/README.md)
for the JSON schema and example decks. Needs no DB. `GITHUB_TOKEN` optional.

### 2. Register a rendered deck into the pipeline

```bash
pnpm tsx scripts/register-carousel.mts <deck.json> <folderId> <title...>
```

Turns an already rendered deck into a draft `ContentItem` so it shows up in the
dashboard content library like any other carousel. Re expands the deck's `repo`
shorthands so the stored spec matches what was rendered, points the item at the
already copied slide files at `/carousels/<folderId>/slide-NN.jpg`, and builds
the caption with the numbered repo/tool links block appended. `title` is the
remaining args joined with spaces. Needs the DB. `GITHUB_TOKEN` optional.

### 3. Cross post a registered carousel to X

```bash
pnpm tsx scripts/generate-thread.mts <carouselItemId> [<itemId> ...]
```

For each carousel item id, reads the stored spec and creates two X drafts for A
or B testing: a full thread (hook tweet, one tweet per repo or tool with its
link, a CTA) and a single post (hook plus one reply carrying all the links). The
cover slide rides the first tweet. Needs the DB. No AI key needed (it works off
the stored spec).

```bash
pnpm tsx scripts/render-x.mts <carouselItemId> [<itemId> ...]
```

Renders 1:1 square (2160x2160) image variants for the X drafts from the stored
spec, and repoints the drafts' media at them. Run this after `generate-thread`
so the thread and post preview cleanly on X (which crops 9:16 and 4:5). Needs
the DB.

### Instagram variants

```bash
pnpm tsx scripts/render-instagram.mts [<carouselItemId> ...]
```

Backfills 4:5 (1080x1350) Instagram renders for existing carousels from their
stored spec and stores the URLs at
`payload.generationMetadata.instagram`. Idempotent. With no ids it processes
every carousel; pass ids to limit it. Needs the DB.

## Batch generation

```bash
pnpm tsx scripts/generate-trends.mts
```

Batch generates ten trend driven carousel drafts for the configured brand.
Topics are a fixed list in the script, each re framed through the brand's
money or time lens by the composer. All land as `draft` behind the approval
gate. Takes no args. Needs the DB and, for real copy, an AI key.

## Maintenance and backfill

```bash
pnpm tsx scripts/recompose-carousels.mts [<carouselItemId> ...]
```

Re composes every carousel (or just the passed ids) under the current brand
voice by re calling the composer, then re renders and re stages any approved
item. Use after a voice or angle change. Needs the DB and, for real copy, an AI
key.

```bash
pnpm tsx scripts/rebrand-carousels.mts
```

Re renders every carousel from its stored spec under the current branding
(palette, logo, safe zones), with no model call. Trims captions to five
hashtags, updates asset URLs, and re exports the staging bundle for any
approved, scheduled, or published item. Takes no args (processes all
carousels). Needs the DB.

```bash
pnpm tsx scripts/generate-longform.mts [<carouselItemId> ...] [--force]
```

Backfills long form resource site articles for existing carousels from their
stored spec, stored at `payload.generationMetadata.longform`. Idempotent: skips
items that already have one unless you pass `--force`. Needs the DB.

## Assets and data

```bash
pnpm tsx scripts/render-stat-cards.mts [output-dir]
```

Renders standalone branded stat cards (not a real carousel) for use as video b
roll. Edit the `CARDS` array at the top of the script, then run it. `output-dir`
defaults to `output/stat-cards`. Needs no DB.

```bash
pnpm tsx scripts/seed-tools.mts
```

Seeds or refreshes the AI tools catalog in the DB. Idempotent (upserts by name),
so it is safe to re run after editing the tool list in the script. The composer
draws fresh, least used tools from this catalog. Takes no args. Needs the DB.

## Smoke test

```bash
pnpm tsx scripts/smoke-carousel.mts
```

Drives the real carousel pipeline against the dev DB with no running server:
compose, render, create a draft, approve, export the staging bundle, and assert
each step. Exits non zero on any failure. Needs the DB. Runs fully offline (the
composer stub covers the no key case).

## Root API smoke tests

Separate from the operator scripts above, `scripts/*.mjs` in the repo root are
API level smoke tests that hit a **running** dev server over HTTP. Start the
server first (`pnpm dev`, `http://localhost:3001`), then run one with plain
`node`. They read `CONTROL_PLANE_URL` (default `http://localhost:3001`) and, for
the machine endpoints, `CONTROL_PLANE_API_TOKEN` (default `dev-token`).

| Script | Covers |
|---|---|
| `node scripts/smoke.mjs` | one content item through the full lifecycle via the public API; asserts the state machine's hard rules |
| `node scripts/smoke-phase1.mjs` | the approval gate: paid link auto tagging, 422 on unfixable paid content, scheduler tick |
| `node scripts/smoke-phase3.mjs` | generation engines and recipes (run `pnpm db:seed` first) |
| `node scripts/smoke-phase4.mjs` | the orchestrator: plan, preview vs execute, drafts never publish, recipe routing (run `pnpm db:seed` first) |
| `node scripts/smoke-phase5.mjs` | wire up endpoints and the measured loop: content detail and audit, filters, recipe CRUD, orchestration run history, connections, metrics to `measured` (run `pnpm db:seed` first) |

---

[Docs index](README.md) · [Project README](../README.md)
