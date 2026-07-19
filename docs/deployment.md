# Deployment

This dashboard runs from one repo and one root `.env`. There are two supported
hosts for the control plane: Railway (persistent disk, the simplest full setup)
and Vercel (serverless, needs Blob storage for rendered slides). Publishing
automation (Postiz and n8n) is optional and layers on top of either.

> Before any public deploy, read [the auth warning](#before-you-expose-it) at
> the bottom. The dashboard ships with auth disabled for local dev.

## Railway (recommended)

The control plane deploys from this repo's `Dockerfile`. `railway.json` pins the
builder and start command:

- Builder: `DOCKERFILE` (`Dockerfile` at the repo root).
- Start command: `pnpm --filter @cmd/control-plane exec next start --port ${PORT:-3001}`.

The Dockerfile installs deps, runs `prisma generate`, builds the control plane,
and starts Next.js. Railway injects `$PORT`.

### Service layout

Everything can live in one Railway project. The publishing services are
optional (see [Postiz](#postiz-optional) and [n8n](#n8n-optional)).

| Service | Source | Notes |
|---------|--------|-------|
| `control-plane` | this repo (`Dockerfile`) | the dashboard and spine |
| `control-plane-db` | Postgres 17 | the spine DB (`DATABASE_URL`) |
| `postiz` | Railway template, pin `ghcr.io/gitroomhq/postiz-app:v2.11.3` | optional: connections, publishing, analytics |
| `postiz-db` | Postgres 17 | Postiz's own DB, do not share with the control plane |
| `postiz-redis` | Redis | Postiz queues |
| `n8n` | Railway template (`Deploy n8n`) | optional: the publish automation |
| `n8n-db` | Postgres | n8n persistence |

### Service variables (control-plane)

Set these as Railway service variables. The full reference with comments is
`.env.example`.

- `DATABASE_URL` (points at `control-plane-db`)
- `CONTROL_PLANE_API_TOKEN` (long random string; guards the cron and machine
  endpoints)
- `NODE_ENV=production`
- AI keys as needed: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`,
  `ORCHESTRATOR_MODEL`, or `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`. See
  [connect-your-agent.md](connect-your-agent.md).
- Optional generation engines: `CLIPPER_API_URL` / `CLIPPER_API_KEY`,
  `HIGGSFIELD_API_URL` / `HIGGSFIELD_API_KEY`.
- If using Postiz: `POSTIZ_API_URL`, `POSTIZ_API_KEY`, `POSTIZ_CHANNELS_DEFAULT`,
  `APP_BASE_URL` (your deployed URL, so Postiz can fetch rendered slides).
- If using n8n: `N8N_WEBHOOK_BASE_URL` (the n8n `.../webhook` base).
- Brand vars (`BRAND_*`) and, for a public deploy, the Clerk keys
  ([see below](#before-you-expose-it)).

Railway has a persistent disk, so rendered slides can be written to disk and
served at `/carousels/...`. You do not need Blob storage here.

### Migrations

The Dockerfile does not run migrations on start (it only runs `next start`).
Apply migrations against the production DB explicitly, as a release step or a
one off command:

```bash
pnpm db:migrate:deploy
```

That root script loads `.env` and runs `prisma migrate deploy` on the
`@cmd/db` package. Point `DATABASE_URL` at the production database when you run
it.

### Cron endpoints

Three endpoints drive the always on loop. They are public in the auth
middleware but each verifies the `x-cmd-signature` header equals
`CONTROL_PLANE_API_TOKEN` in its own handler, so set that token and pass it on
every call. Add these as Railway cron services:

```
* * * * *   curl -fsS -X POST "$CONTROL_PLANE_URL/api/scheduler/tick"  -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
* * * * *   curl -fsS -X POST "$CONTROL_PLANE_URL/api/outbox/drain"    -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
*/5 * * * * curl -fsS -X POST "$CONTROL_PLANE_URL/api/analytics/tick"  -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
```

- `scheduler/tick` publishes approved content that is due (via Postiz), then
  drains the outbox. It is inert until Postiz is configured (returns
  `skipped: postiz_not_configured`).
- `outbox/drain` retries event delivery to n8n (at least once).
- `analytics/tick` pulls metrics for published items and advances them to
  `measured`.

## Vercel

The control plane can also deploy to Vercel. `apps/control-plane/vercel.json`
sets the framework and build:

- Install: `pnpm install --no-frozen-lockfile`
- Build: `pnpm --filter @cmd/db exec prisma generate && next build`

### Vercel requires Blob storage for rendered slides

This is the one hard requirement on Vercel. Serverless functions have a read
only filesystem at runtime, so the renderer cannot write slide PNGs to
`public/carousels/...` and serve them from disk. You must add a Vercel Blob
store to the project (Storage tab) and set its token:

```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

When that token is present, storage switches to Blob automatically (public,
durable URLs) instead of local disk. Without it on Vercel, rendered slides have
nowhere to live. (On Railway or any host with a persistent volume, leave it
unset and slides go to disk.) See the Carousel Engine section of `.env.example`
for the exact behavior.

Set the same AI, brand, Clerk, and (optional) Postiz or n8n variables as
Railway. Run `pnpm db:migrate:deploy` against your production DB separately;
Vercel does not run migrations for you.

## Postiz (optional)

Postiz is the self hosted publisher for connections, scheduling, and analytics.
It is only needed if you want automated publishing beyond the manual staging
bundle or the TikTok draft push.

- Local: `infra/postiz/docker-compose.yml` runs the lean stack (Postgres plus
  Redis, no Temporal) pinned to `v2.11.3`, exposed at `http://localhost:5050`.
- Deploy: use the Railway template and pin the same image. Provision
  `postiz-db` and `postiz-redis` on the private network; do not expose DB ports.
- After first boot, create the admin account, then set
  `DISABLE_REGISTRATION=true` and redeploy so no one else can sign up.

Per platform OAuth apps: for each channel (X, LinkedIn, Facebook or Instagram,
YouTube, TikTok) register a developer app, add its redirect URL, paste the keys
into Postiz env, then connect the channel in the Postiz UI. The commented
`X_API_KEY`, `LINKEDIN_CLIENT_ID`, and so on in `.env.example` list the vars.

Wire the control plane to Postiz with `POSTIZ_API_URL`, `POSTIZ_API_KEY`, and
`POSTIZ_CHANNELS_DEFAULT` (the channel ids that untargeted publishes resolve to).
`POSTIZ_CHANNELS_DEFAULT` matters: without it, an untargeted publish refuses
rather than fanning out across every connected channel.

## n8n (optional)

n8n is the automation backbone that carries the Postiz publish step. The control
plane drains `content.approved` events to n8n, which schedules the post via the
Postiz API and calls back to mark the item published.

- Import `infra/n8n/publish-approved-content.workflow.json` via n8n, Workflows,
  Import from File.
- Set `N8N_WEBHOOK_BASE_URL` on the control plane to the n8n `.../webhook` base.
- Set n8n variables `POSTIZ_API_URL`, `POSTIZ_API_KEY`, `CONTROL_PLANE_URL`,
  then activate the workflow.

Webhook auth, both directions, uses the `x-cmd-signature` header set to
`CONTROL_PLANE_API_TOKEN`:

- Outbound: the control plane signs its deliveries to n8n with that header
  (`packages/integrations/src/n8n.ts`), so the n8n webhook can verify them.
- Inbound: the workflow's callback into `/api/content/<id>/transition` must send
  the same `x-cmd-signature` header, because that route is not public. The
  shipped workflow ships placeholder headers, add the signature there.

## Before you expose it

The dashboard has no gate of its own. In front of it sits Clerk, and a local dev
escape hatch that turns Clerk off. Before any public deploy:

1. **Set up Clerk.** Provide `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` (and the sign in / sign up URL vars). See `.env.example`.
2. **Remove the auth bypass.** `NEXT_PUBLIC_DISABLE_AUTH` defaults to `true` for
   local dev, which disables the entire auth middleware. It must be unset or
   `false` in any deployed environment.

Two gotchas that come from the code:

- `NEXT_PUBLIC_*` values are baked into the client bundle at build time. The
  `Dockerfile` sets `NEXT_PUBLIC_DISABLE_AUTH=true` as a build arg default, so a
  public Railway build must override that build arg, not just the runtime env.
- With auth disabled, the API only requires the `x-cmd-signature` token for the
  machine endpoints; everything else is wide open. Do not deploy in that state.

The state machine still refuses to publish anything that has not passed
`in_review`, and the orchestrator still has no publish tool. But that is the
content safety gate, not an access gate. Clerk is what keeps strangers out of
the dashboard.

---

[Docs index](README.md) · [Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
