# Setup

A from-zero walkthrough to run the Content Management Dashboard locally and
generate your first carousel. Everything here is verified to work with no API
keys, in keyless local mode.

Hit a snag? Jump to [Troubleshooting](#troubleshooting).

## Prerequisites

- **Node >= 20.** Check with `node --version`.
- **pnpm 10.32.1.** The repo pins this in `package.json`. The simplest way to get
  the right version is Corepack, which ships with Node:
  ```bash
  corepack enable
  corepack prepare pnpm@10.32.1 --activate
  ```
- **Docker Desktop.** Used for the local Postgres. Make sure it is running before
  the database steps.

## Quick start

Run these from the repository root.

### 1. Install dependencies

```bash
pnpm install
```

Installs the workspace (control-plane app plus the `@cmd/*` packages) with pnpm.

### 2. Create your env file

```bash
cp .env.example .env
```

The template works untouched. It ships with `NEXT_PUBLIC_DISABLE_AUTH="true"`
(no login locally) and no AI key (composition uses a deterministic stub). The
`DATABASE_URL` already points at the Docker Postgres you start next. Do not deploy
with auth disabled; see the warning at the end of this doc.

### 3. Start the database

```bash
pnpm db:up
```

Starts Postgres 17 in Docker via `infra/dev/docker-compose.yml`. The container is
named `content-dashboard-db` and binds host port **55433** (not 5432, so it does
not collide with any Postgres you already run). Expected output:

```
[+] Running 2/2
 Network content-dashboard_default   Created
 Container content-dashboard-db      Started
```

### 4. Apply the schema

```bash
pnpm db:migrate
```

Runs `prisma migrate dev`, which applies the single init migration and generates
the Prisma client. Expected output ends with something like:

```
Applying migration `20260716194851_init`
Your database is now in sync with your schema.
Generated Prisma Client
```

### 5. Seed example data

```bash
pnpm db:seed
```

Loads two example recipes (`podcast-to-clips` and `daily-x-thread`). The command
is idempotent, so re-running it just upserts them. Expected output:

```
seeded 2 recipes
```

### 6. Start the dashboard

```bash
pnpm dev
```

Runs the control-plane Next.js app (a `predev` hook also tries to start the DB, so
this is safe to run on its own). Expected output includes:

```
  ▲ Next.js 15.x
  - Local:   http://localhost:3001
  ✓ Ready
```

Open `http://localhost:3001`. Because auth is disabled, you land straight on the
dashboard with a `local dev` badge in the header.

## What you see at :3001

The left sidebar is ordered along the content funnel. One line each:

- **Dashboard** the pipeline overview and system health.
- **Topics** paste topics, generate one carousel per line.
- **Tools** the AI-tool catalog plus "generate from the freshest tools".
- **Record** a screen recorder studio for source footage.
- **Content** every content item and its state.
- **Board** a kanban board across the lifecycle states.
- **Approval** the review inbox; approve or reject drafts.
- **Ready to post** approved carousels staged for posting, with preview,
  TikTok push, and bundle download.
- **Replies** AI-drafted comment replies awaiting your review.
- **Calendar** scheduled items over time.
- **Recipes** saved one-click workflows (the two you seeded appear here).
- **Engines** generation engines and their health.
- **Chat** the natural-language orchestrator console.
- **Settings** brand, connections, and account.

Press `Cmd/Ctrl + K` anywhere for a command palette that jumps between screens.

## Generate your first carousel

### In the UI

Two easy entry points:

- **Tools page.** Open **Tools**, use the "Generate from fresh tools" panel, pick
  a count (and optionally a category), and generate. It selects the least-recently
  used tools from the catalog, composes a deck that features exactly them, and
  saves the slides as a `draft`. (If the catalog is empty, seed it first with the
  `seed-tools` script; see [scripts.md](scripts.md).)
- **Topics page.** Open **Topics**, paste one topic per line, and click
  **Generate**. It runs each topic through the same generate path, one carousel
  per topic, so you can watch progress.

Either way the result lands as a `draft`. Go to **Approval** to review it, then
**Ready to post** to preview the slides, push to TikTok, or download the bundle.

In keyless mode the copy comes from the deterministic stub. Set
`OPENROUTER_API_KEY` (preferred) or `ANTHROPIC_API_KEY` in `.env` for real
brand-voice copy, then restart `pnpm dev`.

### Via script

Render a deck straight to disk without the UI:

```bash
pnpm tsx scripts/render-carousel.mts scripts/decks/github-trending-1.json output/github-trending-1
```

`pnpm tsx` loads the root `.env` and runs `tsx` inside `apps/control-plane`, so
the deck path and output path are resolved from there. Other example decks live in
`apps/control-plane/scripts/decks/`.

## Where rendered slides live

- **UI generation** writes slides to `apps/control-plane/public/carousels/<id>/`,
  served by the app at `/carousels/...` for preview. Override the directory with
  `CAROUSEL_PUBLIC_DIR`, or set `BLOB_READ_WRITE_TOKEN` to store them in Vercel
  Blob (needed on read-only serverless hosts).
- **The render script** writes JPEG slides (`slide-01.jpg`, `slide-02.jpg`, ...)
  to the output directory you pass, resolved relative to `apps/control-plane`.
  With the command above that is `apps/control-plane/output/github-trending-1/`.
- **Approved carousels** are exported as ready-to-post bundles (slides plus
  `caption.txt`) to `CAROUSEL_STAGING_DIR`, defaulting to `<cwd>/output/tiktok`.

## Troubleshooting

- **Port 3001 already in use.** Next.js dev automatically increments to the next
  free port and prints the URL it chose. Read the `Local:` line in the output.
- **Port 55433 already in use.** Something else is bound to the Docker Postgres
  port. Change the host side of the mapping in `infra/dev/docker-compose.yml`
  (the `"55433:5432"` line) and update the port in `DATABASE_URL` to match.
- **Docker is not running.** `pnpm db:up` fails to connect to the daemon. Start
  Docker Desktop and retry. If `pnpm dev` warns that the dev DB did not start,
  that is the `predev` hook telling you Docker is down; your data is safe in the
  `control_plane_pgdata` volume.
- **Prisma client out of date** (type errors after a schema change or a fresh
  clone). Regenerate it:
  ```bash
  pnpm db:generate
  ```
- **Database is empty.** Make sure you ran `pnpm db:migrate` and `pnpm db:seed`.
  You can browse the data with `pnpm db:studio`.

## Do not deploy with auth disabled

`NEXT_PUBLIC_DISABLE_AUTH="true"` is a local-only convenience. The dashboard has
no other gate in front of it, so a deployed instance with this flag set is open to
anyone on the internet. For any deployed environment, set
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` and remove (or set to
`false`) the disable flag. See [deployment.md](deployment.md).

## Next steps

- **Turn on real AI copy.** [connect-your-agent.md](connect-your-agent.md) covers
  the provider chain, model config, and the no-publish safety design.
- **Make it yours.** [branding.md](branding.md) covers the `BRAND_*` env vars and
  regenerating your logo, banner, and social preview.
- **Go live.** [deployment.md](deployment.md) covers Railway and Vercel, plus the
  optional Postiz and n8n publishing stack.

---

[Docs index](README.md) · [Project README](../README.md)
