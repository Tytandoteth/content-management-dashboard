# Contributing

Thanks for looking at content-management-dashboard. This is a small monorepo, so
getting set up is quick. For the full picture, browse the
[documentation index](docs/README.md).

## Dev setup

Full instructions are in [docs/SETUP.md](docs/SETUP.md). The short version:

```bash
pnpm install
cp .env.example .env      # defaults match the dev Postgres below
pnpm db:up                # local Postgres via Docker (port 55433)
pnpm db:generate && pnpm db:migrate
pnpm dev                  # dashboard on http://localhost:3001
```

The AI features work with no key (a deterministic stub kicks in), so you can
develop and run the tests offline. To exercise the real model path, set one key
per [docs/connect-your-agent.md](docs/connect-your-agent.md).

## Layout

A pnpm plus Turborepo monorepo: `apps/control-plane` is the Next.js dashboard and
spine; `packages/*` are the shared libraries (`@cmd/brand`, `@cmd/carousel-render`,
`@cmd/contracts`, `@cmd/db`, `@cmd/generation`, `@cmd/integrations`,
`@cmd/orchestrator`). Operator scripts live in `apps/control-plane/scripts`
(see [docs/scripts.md](docs/scripts.md)); infra and deploy config live in
`infra/` (see [docs/deployment.md](docs/deployment.md)).

## Checks before a PR

Run all three from the repo root. They run across the whole workspace via Turbo:

```bash
pnpm test        # unit, renderer, composer, and orchestrator tests
pnpm typecheck
pnpm build
```

Please make sure all three pass before opening a PR.

## Code style

- Match the surrounding style. This codebase favors small, well commented
  modules that explain the why, not the what.
- **No em dashes in copy.** This is a hard rule and it is code enforced: run any
  outgoing copy through `noEmDash()` from `@cmd/brand`
  (`packages/brand/src/copy.ts`). Use commas, periods, or colons instead. There
  is a test (`packages/brand/src/brand.test.ts`) that guards it.
- Keep personal brand data out of defaults. Brand values are env driven with
  neutral placeholders (`@yourhandle`, `Your Brand`); do not hardcode a real
  handle, link, or domain.
- Keep the safety gate intact. Do not add a tool, endpoint, or code path that
  publishes, sends, deletes, or spends without a human approval step. The
  orchestrator has no publish tool by design; see
  [docs/connect-your-agent.md](docs/connect-your-agent.md).

## Where to add tests

Tests sit next to the code they cover as `*.test.ts` in each package's `src`
(for example `packages/orchestrator/src/orchestrator.test.ts`,
`packages/carousel-render/src/render.test.ts`). Add unit tests in the package
you changed. For behavior that spans the running app, extend the smoke tests in
`scripts/` ([docs/scripts.md](docs/scripts.md)).

## Pull requests

Keep PRs focused and describe what changed and why. Note any new environment
variable in `.env.example`. If you touch the pipeline, mention how you verified
it (the smoke tests are the easiest proof).
