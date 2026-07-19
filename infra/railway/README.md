# Railway deployment

The control plane deploys from this repo on Railway. Postiz and n8n are optional
and deploy from Railway templates. Everything can live in one project.

## Services

| Service | Source | Notes |
|---------|--------|-------|
| `control-plane` | this repo (root `Dockerfile`) | the dashboard and spine |
| `control-plane-db` | Postgres 17 | the spine DB (`DATABASE_URL`) |
| `postiz` | Railway template (pin `ghcr.io/gitroomhq/postiz-app:v2.11.3`) | optional: connections, publishing, analytics |
| `postiz-db` | Postgres 17 | Postiz's own DB (do not share with the control plane) |
| `postiz-redis` | Redis | Postiz queues |
| `n8n` | Railway template (`Deploy n8n`) | optional: the publish automation |
| `n8n-db` | Postgres | n8n persistence |

## control-plane service config

The build and start are driven by the root `railway.json` and `Dockerfile`, so
you do not set build or start commands by hand:

- **Builder:** `DOCKERFILE` (root `Dockerfile`). It installs deps, runs
  `prisma generate`, and builds the control plane.
- **Start command** (from `railway.json`):
  `pnpm --filter @cmd/control-plane exec next start --port ${PORT:-3001}`.
- **Watch paths:** `apps/control-plane/**`, `packages/**`.

Variables: `DATABASE_URL` (control-plane-db), `CONTROL_PLANE_API_TOKEN`,
`NODE_ENV=production`, plus the AI and generation envs as needed:
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `ORCHESTRATOR_MODEL` (or
`ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`),
`CLIPPER_API_URL` / `CLIPPER_API_KEY`, `HIGGSFIELD_API_URL` / `HIGGSFIELD_API_KEY`.
Add `N8N_WEBHOOK_BASE_URL`, `POSTIZ_API_URL`, `POSTIZ_API_KEY`, and
`POSTIZ_CHANNELS_DEFAULT` only if you run the publishing services. For a public
deploy, set the Clerk keys and override `NEXT_PUBLIC_DISABLE_AUTH` (it defaults
to `true` as a Dockerfile build arg, so override it at build time, not just at
runtime). Full reference: `.env.example`.

Railway has a persistent disk, so rendered slides write to disk and serve at
`/carousels/...`; you do not need `BLOB_READ_WRITE_TOKEN` here.

## Migrations

The Dockerfile start does not run migrations. Apply them against the production
DB explicitly (a release step or one off command), with `DATABASE_URL` pointed
at that database:

```bash
pnpm db:migrate:deploy
```

## Crons (token-guarded)

Each endpoint verifies the `x-cmd-signature` header equals
`CONTROL_PLANE_API_TOKEN`. Add these as Railway cron services:

```
* * * * *   curl -fsS -X POST "$CONTROL_PLANE_URL/api/scheduler/tick"  -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
* * * * *   curl -fsS -X POST "$CONTROL_PLANE_URL/api/outbox/drain"    -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
*/5 * * * * curl -fsS -X POST "$CONTROL_PLANE_URL/api/analytics/tick"  -H "x-cmd-signature: $CONTROL_PLANE_API_TOKEN"
```

- `scheduler/tick` publishes approved content that is due (via Postiz), then
  drains the outbox. Inert until Postiz is configured.
- `outbox/drain` retries event delivery to n8n (at least once).
- `analytics/tick` pulls metrics for published items and advances them to
  `measured`.

See [../../docs/deployment.md](../../docs/deployment.md) for the full,
step-by-step deployment guide (including Vercel, Postiz, and n8n).
