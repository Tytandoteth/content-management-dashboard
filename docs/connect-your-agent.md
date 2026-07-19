# Connect your AI agent

Connect Claude (or any OpenRouter model) to your content pipeline. This dashboard
is built so that wiring your own AI into it is a one variable change, and so that
nothing an AI does can go public on its own. This page covers both halves: how to
turn the AI features on, and the safety design that keeps a human in the loop.

## The 60 second version

Set one environment variable in the root `.env` and the AI features light up:

```bash
# either one is enough
OPENROUTER_API_KEY="sk-or-..."      # preferred
# or
ANTHROPIC_API_KEY="sk-ant-..."      # direct Anthropic
```

With one of these set, the carousel composer writes real, brand voice slide
copy and the chat console at `/chat` plans your plain English requests with a
model.

With **neither** set, everything still runs. A deterministic stub takes over so
you can install, browse the dashboard, generate placeholder decks, and run the
smoke tests offline with no key and no spend. The stub is not clever, it just
keeps the whole pipeline exercisable.

That is the whole "connect your agent" story. The rest of this page explains
what each key powers, how to point it at a different model, and why there is no
publish button on the AI.

## The provider chain (and where it lives)

Two separate touchpoints call a model, and they resolve their provider slightly
differently. Both live in code you can read.

### Carousel composer and comment replies

`apps/control-plane/src/lib/carousel/compose.ts` (the slide copywriter) and
`apps/control-plane/src/lib/llm.ts` (a shared one shot LLM call used by comment
replies) pick a provider the same way:

1. `OPENROUTER_API_KEY` set: use OpenRouter.
2. else `ANTHROPIC_API_KEY` set: call the Anthropic API directly.
3. else: return nothing, and the caller falls back to the deterministic stub.

### Orchestrator chat planner

`apps/control-plane/src/lib/orchestrator/index.ts` (`buildPlanner`) resolves
only two ways:

1. `OPENROUTER_API_KEY` set: use the `OpenRouterPlanner`
   (`apps/control-plane/src/lib/orchestrator/openrouter-planner.ts`).
2. else: use the deterministic `HeuristicPlanner` from `@cmd/orchestrator`.

Note the difference: the orchestrator planner does not use the direct Anthropic
key path. If you only set `ANTHROPIC_API_KEY`, your carousel copy is model
written but the chat console runs on the keyless heuristic planner. To get a
model planning your chat requests, set `OPENROUTER_API_KEY`. (The package does
ship an Anthropic tool use mapper, `toolUsesToPlan` in
`packages/orchestrator/src/claude-mapper.ts`, but the shipped control plane
wires the OpenRouter planner, not a direct Anthropic one.)

### Environment variables and defaults

All read in `apps/control-plane/src/lib/env.ts` and documented in
`.env.example`:

| Variable | Default | Used by |
|---|---|---|
| `OPENROUTER_API_KEY` | empty | both touchpoints, preferred |
| `ANTHROPIC_API_KEY` | empty | composer and comment replies only |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter calls |
| `ORCHESTRATOR_MODEL` | `anthropic/claude-sonnet-5` | the OpenRouter model slug for the composer and the planner |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | the Anthropic API model id, direct key path |

Overriding models is just setting those vars. `ORCHESTRATOR_MODEL` is an
OpenRouter slug, so any OpenRouter model works there
(`anthropic/claude-sonnet-5`, `openai/gpt-4o-mini`, and so on).
`ANTHROPIC_MODEL` is an Anthropic API model id. Point `OPENROUTER_BASE_URL` at a
compatible gateway if you proxy OpenRouter.

## What each AI touchpoint does

### Carousel composer

`composeSpec()` in `compose.ts` turns a plain English topic into a fully decided,
on brand `CarouselSpec`: a hook slide, body slides, a CTA slide, a caption, and
hashtags. It is strict about output:

- The model is asked for a single JSON object. `parseJsonObject()` strips code
  fences and extracts the object.
- Malformed JSON is repaired once (`repairJson()` quotes stray hashtag tokens)
  before a second parse.
- If the topic promises a count ("5 tools", "7 prompts"), the composer enforces
  exactly that many body slides and retries once if the model under or over
  delivers.
- A valid but imperfect deck is kept over the generic stub. Only a total failure
  after retries falls back to `stubSpec()`.

So even the AI path is validated and self correcting, and the stub guarantees
the renderer always gets a well formed deck.

### The chat console at `/chat`

The orchestrator turns a plain English request into a plan of tool calls over a
small, fixed catalog, then (optionally) executes it. The moving parts:

- Tool catalog: `packages/orchestrator/src/tools.ts` defines exactly two tools,
  `generate_content` and `run_recipe`, as Anthropic compatible JSON schemas.
- Planners: `OpenRouterPlanner` (model) or `HeuristicPlanner`
  (`packages/orchestrator/src/heuristic-planner.ts`, a deterministic parser that
  detects the content type, a count, a URL, or a recipe slug).
- Mappers: `openAiToolCallsToPlan` and `toolUsesToPlan` in `claude-mapper.ts`
  translate a model response into an `OrchestrationPlan`. Tool calls for names
  outside the catalog are dropped, so the model cannot invent an action.
- Executor: `apps/control-plane/src/lib/orchestrator/executor.ts` maps each tool
  call onto `runGeneration` or `runRecipe`. Everything it produces is a draft.

Preview a plan with `execute: false`, then run it. Results land in the approval
inbox, never live.

## The safety design (read this before wiring a model to real accounts)

The single most important design choice in this project: **the orchestrator has
no publish tool, on purpose.**

Look at `packages/orchestrator/src/tools.ts`. The catalog is `generate_content`
and `run_recipe`. There is no `publish`, no `post`, no `send`. The executor
(`executor.ts`) has no publish path either. Both files say so in comments. The
system prompt (`ORCHESTRATOR_SYSTEM_PROMPT` in `claude-mapper.ts`) tells the
model in plain words that it may generate and queue content but can never
publish.

The result: the most an AI can do here is fill your approval inbox with drafts.
A human reviews and approves anything before it reaches a real account. The
content lifecycle state machine enforces the same rule from the other side:
nothing reaches `published` without passing through `in_review`.

Why this matters when you connect a model to real social accounts:

- A model can be wrong, or be steered wrong by text it reads (prompt injection
  from a source URL, a comment, a fetched page). If the model could publish, a
  bad plan would be live before you saw it.
- Draft only means the blast radius of any mistake is your review queue, not
  your audience. You get the speed of automation and keep the final call.
- It composes safely: you can let the orchestrator run on a schedule and still
  sleep, because the gate does not move.

If you extend this project, keep that gate. Do not add a tool that publishes,
DMs, changes settings, or spends money without a human approval step in front of
it.

## Customizing the brand voice the AI writes in

The composer writes in a configurable voice, so you do not fork code to change
the niche. The persona is the main lever:

```bash
BRAND_VOICE_PERSONA="A calm, precise brand voice that ..."
```

The default (when unset) is the AI tools creator persona shipped in
`packages/brand/src/brand.ts` (`BRAND_VOICE`). Only the persona is env driven;
the audience, the outcome rules, and the save optimized slide structure stay
fixed because they encode the format, not the niche.

The rest of the brand is env driven too, all under the `BRAND_*` prefix and
documented in the Brand section of `.env.example`: `BRAND_HANDLE`,
`BRAND_DISPLAY_NAME`, `BRAND_X_HANDLE`, `BRAND_CTA_URL`, `BRAND_CTA_LABEL`,
`BRAND_TAGLINE`, and the color vars. Defaults are neutral placeholders
(`@yourhandle`, `Your Brand`), so nothing personal ships until you set them.

## Extending

### Add a new generator engine

Generators are adapters behind one interface. The contract is in
`packages/generation/src/types.ts`:

```ts
export interface Generator {
  name: string;                 // unique adapter name, e.g. "oss-clipper"
  engine: string;               // engine family, e.g. "higgsfield"
  supports: ContentType[];      // content types it can produce
  manual?: boolean;             // if true, the registry never auto routes to it
  generate(brief: GenerationBrief): Promise<GenerationResult>;
  healthcheck(): Promise<GeneratorHealth>;  // "ok" | "degraded" | "down"
}
```

To add one:

1. Implement `Generator` (see `OssClipperGenerator` /
   `HiggsfieldGenerator` in `apps/control-plane/src/lib/generators/http-generators.ts`
   for the HTTP shape, or the in process `CarouselComposer`).
2. Register it in `buildRegistry()` in
   `apps/control-plane/src/lib/generators/registry.ts`, gated on its own env var
   so it only activates when configured.
3. The registry is health aware: it skips `down` engines and prefers `ok` over
   `degraded`, and never auto routes to a `manual` lane. No routing code changes,
   the registry picks up your engine from env.

### Add a new orchestrator tool responsibly

A tool is one entry in `ORCHESTRATOR_TOOLS` (`packages/orchestrator/src/tools.ts`)
plus one branch in the executor (`executor.ts`, `runStep`). The type to satisfy
is the tool object: a `name`, a `description`, and an `input_schema` (a JSON
schema of its arguments). `ToolName` is derived from the catalog, and
`isToolName()` is what both mappers use to drop anything off catalog.

Do this responsibly:

- Keep the tool to generating or queuing drafts. Do not add a tool that
  publishes, sends, deletes, changes access, or spends. That is the whole point
  of the missing publish tool above.
- Add a matching branch in `runStep`, and make it produce draft `ContentItem`s
  that flow through the approval gate like everything else.
- Update the heuristic planner if you want the keyless path to reach your tool
  too, so the feature still works with no model configured.

---

[Docs index](README.md) · [Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
