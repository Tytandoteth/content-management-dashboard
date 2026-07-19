# Documentation

Everything you need to run, understand, extend, and deploy the Content Management
Dashboard, the open-source AI carousel studio where Claude writes, Satori renders,
and a human approves.

New here? Start with [SETUP.md](SETUP.md), then skim [ARCHITECTURE.md](ARCHITECTURE.md).

| Doc | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | From-zero local setup, the dashboard tour, and generating your first carousel. Keyless, no API key required. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The monorepo, the content state machine, the carousel request flow, the orchestrator, the database schema, and integration points. |
| [connect-your-agent.md](connect-your-agent.md) | Connect Claude or OpenRouter to your content pipeline: the provider chain, model config, and the no-publish safety design. |
| [branding.md](branding.md) | Make it yours: the `BRAND_*` env vars, the logo assets you swap, and regenerating your logo, banner, and social preview. |
| [templates.md](templates.md) | Carousel styles: how the template registry works, installing a purchased pack, and writing your own with `defineCarouselTemplate`. |
| [scripts.md](scripts.md) | The operator scripts: render, register, cross-post to X and Instagram, batch generate, seed, and the smoke tests. |
| [deployment.md](deployment.md) | Production deployment on Railway or Vercel, cron endpoints, and the optional Postiz and n8n publishing stack. |
| [tiktok-auto-post.md](tiktok-auto-post.md) | Push approved carousels to your TikTok drafts through the Content Posting API. |
| [../apps/control-plane/scripts/decks/README.md](../apps/control-plane/scripts/decks/README.md) | The deck JSON format (slides, styles, formats, repo cards) and the example decks. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Dev setup, the pre-PR checks, code style, and where to add tests. |

---

[Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
