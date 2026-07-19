# Templates: build your own, install packs

Every carousel look, whether one of the four that ship in the box or a pack
you install or write, is a **template**: an id, a label, and three functions
that turn a slide's data into a Satori vnode. This doc covers how the
template system works, how to install a purchased pack, how to author your
own, and the full authoring reference (the `CarouselTemplate` contract, the
`h()` vnode rules, `SlideContext`, `Slide`, safe zones, fonts, and brand
tokens).

## How styles work

Every template, builtin or installed, is registered into one in-process
registry (`packages/carousel-render/src/registry.ts`) at module load.
Registration order is fixed: the four builtins first, in their canonical
order (`editorial`, `gradient-pop`, `paper-light`, `terminal-dev`), then any
installed pack, sorted alphabetically by id. `listCarouselTemplates()`, which
is what `/api/templates` and the dashboard's style dropdown call, returns
them in that order, and `registerCarouselTemplate()` throws if a pack's id
collides with one already registered, naming both templates so the collision
is easy to track down.

The four builtins live in `packages/carousel-render/src/templates.builtin.ts`,
each wrapping a trio of role renderers from its own module
(`templates.ts` for editorial, `templates.gradientpop.ts`,
`templates.paperlight.ts`, `templates.terminaldev.ts`). Installed packs are
discovered by `pnpm templates:sync` (below) and imported through the
generated `src/templates.index.generated.ts`.

A deck's chosen style is just the template's `id`, stored as a plain string:
in a deck JSON's top-level `style` field, in `RenderOptions.style` when
calling `renderCarousel()`, and in a registered content item's
`generationMetadata.style` so re-renders (`rebrand-carousels.mts`) keep the
same look. Because it's an open string rather than a closed union, an
installed pack's id works everywhere a builtin id does with no code changes.
If a deck references a style id that isn't registered (a pack got
uninstalled, or the id was mistyped), `resolveCarouselTemplate()` falls back
to `editorial` and logs one `console.warn` per distinct unknown id (not once
per render), so a stale reference degrades gracefully instead of failing the
render.

## Installing a template pack

1. Unzip the pack folder into `packages/carousel-render/templates/`, e.g.
   `packages/carousel-render/templates/my-pack/`.
2. From the repo root, run:
   ```bash
   pnpm templates:sync
   ```
3. Restart the dev server (or rebuild): the registry reads the generated
   `INSTALLED_TEMPLATES` list once at module load, so a running process won't
   pick up a new pack without a restart.

`templates:sync` scans every `.ts` file under `templates/` (skipping
`.d.ts` files and any file whose name starts with `_`, for shared helper
modules), validates each one's default export against the
`defineCarouselTemplate` shape, checks for id collisions against the
builtins and among the scanned packs, and rewrites
`src/templates.index.generated.ts` deterministically. It prints one of:

- `[templates:sync] updated (N template(s))`: the generated file changed.
- `[templates:sync] unchanged (N installed template(s))`: nothing to do.
- A validation or collision error, one line per problem, and exits non-zero;
  nothing is written in that case.

After a successful sync, `src/templates.index.generated.ts` will show up as
locally modified in `git status`. That's expected and fine: it's a generated
file that reflects whatever's currently unzipped into `templates/` on your
machine, not something you hand-edit or need to keep clean between installs.

To uninstall a pack, delete its folder from `templates/` and re-run
`pnpm templates:sync`.

The `templates/` folder itself is gitignored on purpose: only
`templates/README.md` is tracked. Purchased packs must never be committed to
a public fork of this repo; installing one is a local, per-machine step.

## Build your own template

A template pack is one TypeScript file whose default export is
`defineCarouselTemplate({...})`. The only import you need is
`@cmd/carousel-render/template-api`, which re-exports the whole authoring
toolkit (`h`, `clean`, and the `VNode` / `SlideContext` / `Slide` types) so a
pack never has to reach into the package's internals.

Here's a complete, minimal working example: one shared layout used for all
three slide roles. This is the exact code verified against the real pipeline
while writing this doc (synced, typechecked, and rendered to JPEGs with no
errors):

```ts
// templates/my-pack/my-style.ts
import {
  defineCarouselTemplate,
  h,
  clean,
  type Slide,
  type SlideContext,
  type VNode,
} from "@cmd/carousel-render/template-api";

/** Minimal starter pack: one shared layout used for all three slide roles. */
const INK = "#151515";
const PAPER = "#fefaf3";
const ACCENT = "#3355ff";

function root(ctx: SlideContext, children: VNode[]): VNode {
  return h(
    "div",
    { position: "relative", display: "flex", width: ctx.width, height: ctx.height, backgroundColor: PAPER, fontFamily: "Inter" },
    children,
  );
}

function content(ctx: SlideContext, children: VNode[]): VNode {
  return h(
    "div",
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: ctx.width,
      height: ctx.height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: ctx.safeTop ?? 264,
      paddingRight: ctx.safeRight ?? 132,
      paddingBottom: ctx.safeBottom ?? 340,
      paddingLeft: ctx.safeLeft ?? 96,
    },
    children,
  );
}

function slide(s: Slide, ctx: SlideContext): VNode {
  const headline = clean(s.headline) ?? s.headline;
  const body = clean(s.body);
  return root(ctx, [
    content(ctx, [
      h("div", { display: "flex", fontFamily: "Sora", fontSize: 30, fontWeight: 700, color: ACCENT }, `${ctx.index} / ${ctx.total}`),
      h("div", { display: "flex", flexDirection: "column" }, [
        h("div", { display: "flex", fontFamily: "Sora", fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: INK }, headline),
        body
          ? h("div", { display: "flex", fontFamily: "Inter", fontSize: 40, fontWeight: 400, marginTop: 24, color: INK }, body)
          : h("div", { display: "flex" }),
      ]),
      h("div", { display: "flex", fontFamily: "Inter", fontSize: 28, fontWeight: 600, color: ACCENT }, "Swipe »"),
    ]),
  ]);
}

export default defineCarouselTemplate({
  id: "my-style",
  label: "My Style",
  hook: slide,
  body: slide,
  cta: slide,
});
```

Save that as `packages/carousel-render/templates/my-pack/my-style.ts`, then:

```bash
pnpm templates:sync
pnpm --filter @cmd/carousel-render typecheck
```

Both must pass clean before you render. `templates:sync` also doubles as
validation: a bad shape (missing `hook`/`body`/`cta`, a non-kebab-case `id`,
an empty `label`) fails the sync with a message naming the offending field,
before it ever reaches the renderer.

To see it render, point `render-carousel.mts` at any deck JSON with
`"style": "my-style"` (see [Testing your template](#testing-your-template)
below for the deck shape) and run:

```bash
pnpm tsx scripts/render-carousel.mts <deck.json> <output-dir>
```

A real pack usually splits the three role renderers into their own functions
(see `templates.paperlight.ts` for the shape of a fuller starter style: a
`repoCard()` helper, per-role headline sizing, a photo-mode branch for cover
images), but nothing requires that; one shared function per slide, as above,
is a completely valid template.

## Authoring reference

### The `CarouselTemplate` contract

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), e.g. `"gradient-pop"`. Stored as the deck/DB `style` value. Must be unique across builtins and every installed pack. |
| `label` | `string` | yes | Non-empty. Human-facing name shown in the dashboard's style dropdown and `/api/templates`. |
| `premium` | `boolean` | no | Purely informational; the registry doesn't enforce anything from it. The dashboard picker renders a `★` next to the label when set. |
| `hook(slide, ctx)` | `(Slide, SlideContext) => VNode` | yes | Renders the cover / scroll-stopping first slide. |
| `body(slide, ctx)` | `(Slide, SlideContext) => VNode` | yes | Renders a tip / list-item slide, most of the deck. |
| `cta(slide, ctx)` | `(Slide, SlideContext) => VNode` | yes | Renders the closing call-to-action slide. |

`defineCarouselTemplate()` validates this shape at call time and throws a
`TypeError` naming the offending field, so a malformed template fails loudly
at sync time rather than rendering a broken slide.

### `h()` and the Satori vnode rules

Satori is not a browser: it implements a subset of flexbox CSS over a plain
`{ type, props }` vnode tree, not real HTML/CSS. `h(type, style, children)`
(from `templates.ts`, re-exported by `template-api`) builds that shape:
`h("div", { display: "flex", ... }, "text")` returns
`{ type: "div", props: { style: {...}, children: "text" } }`. Reading the
four builtin style modules end to end, the practical rules that fall out are:

1. **Every element needs an explicit `display: "flex"`.** Satori's layout
   engine only understands flexbox; a `div` without it doesn't lay out
   children at all. There's no implicit block/inline flow to fall back on.
2. **`h()` is for style-bearing elements; images are raw vnode objects.**
   `h()` always nests its second argument under `props.style`, so it can't
   express `<img src>` (a top-level prop, not a style). Every builtin writes
   images as `{ type: "img", props: { src: dataUri, style: {...} } }`
   directly instead of going through `h()`.
3. **Position full-bleed layers by hand.** There's no viewport unit or
   implicit sizing: the root is `position: "relative"` sized to
   `ctx.width`/`ctx.height`, and any full-bleed layer (background, the
   content column) is `position: "absolute", top: 0, left: 0` with explicit
   `width`/`height` matching the canvas.
4. **Only flexbox layout, no CSS Grid.** Arrange children with
   `flexDirection`, `justifyContent`, `alignItems`, and `gap`; there's no
   `display: grid`.
5. **Some shorthands work, `background` doesn't.** `padding: "12px 22px"`,
   `border: "2px solid #fff"`, and `backgroundImage:
   "linear-gradient(150deg, #a, #b)"` / `"radial-gradient(...)"` are all used
   throughout the builtins as plain CSS strings. There's no generic
   `background` shorthand though; set `backgroundColor` or `backgroundImage`
   explicitly.
6. **Text is a plain string, passed as `children`.** Never wrap a string in
   another element to "contain" it: `h("div", {...}, "Swipe »")` is the
   whole pattern; a paragraph of copy is one `div` with a string child, not a
   tree of inline spans.
7. **`fontFamily` must be a bundled family.** `"Sora"`, `"Inter"`, or
   `"JetBrains Mono"` (see [Fonts](#fonts) below); Satori has no system-font
   fallback, so any other family name silently fails to render the intended
   glyphs.
8. **Sanitize free text yourself.** The registry's `slideElement()` only runs
   `clean()` on `slide.headline`, `slide.body`, `slide.kicker`, and
   `slide.coverStat` before calling your renderer. Anything you pull out of
   `slide.card` or `slide.terminal` (repo titles, stat labels, terminal
   lines) is NOT pre-cleaned; call `clean()` on it yourself, the way
   `repoCard()` does in every builtin style, or emoji/arrows/CJK in that text
   will render as tofu boxes (the bundled fonts are Latin-only).

### `SlideContext` fields

Passed as the second argument to every role renderer (from `templates.ts`):

| Field | Type | Notes |
|---|---|---|
| `index` | `number` | 1-based position of this slide in the deck. |
| `total` | `number` | Total slide count in the deck. |
| `width` / `height` | `number` | Canvas size in px for this render (see [Safe zones](#safe-zones-and-canvas-sizes)). |
| `style` | `CarouselStyle?` | The deck's style id. Defaults to `"editorial"` when unset. |
| `backgroundDataUri` | `string?` | The slide's `bgImageUrl`, already fetched and resolved to a data URI. Undefined when the slide has no cover image. |
| `logoDataUri` | `string?` | The `slide.tool`'s logo, resolved to a data URI, when the tool is recognized. |
| `cardAvatarDataUri` | `string?` | `slide.card.avatarUrl`, resolved to a data URI. |
| `toolDomain` | `string?` | The `slide.tool`'s domain (e.g. `"opus.pro"`), for a "Get it: opus.pro" style chip. |
| `safeTop` / `safeRight` / `safeBottom` / `safeLeft` | `number?` | Safe-area insets for this format. Defaults to the TikTok 9:16 zones if unset. Always read these rather than hardcoding padding (see below). |
| `hideSwipeHint` | `boolean?` | Set when a slide renders standalone (e.g. a stat-card image for video b-roll) rather than as part of a real swipeable carousel; hide any "Swipe »" affordance when true. |
| `handle` | `string?` | The `@handle` to stamp on this slide. X is a separate account from TikTok/Instagram, so an X render carries its own; use the `handleOf(ctx)` helper pattern (falls back to `BRAND_IDENTITY.handle`) rather than reading `BRAND_IDENTITY.handle` directly. |

### `Slide` fields an author receives

From `packages/carousel-render/src/types.ts`:

| Field | Type | Notes |
|---|---|---|
| `role` | `"hook" \| "body" \| "cta"` | Which of your three renderers is being called; you generally don't need to branch on it inside a shared renderer. |
| `kicker` | `string?` | Short eyebrow above the headline (tool name, "Step 2", etc.). |
| `coverStat` | `string?` | Hook slides only: the single most thumbnail-worthy payoff (`"$500/mo"`, `"10 hrs"`), meant to render as a giant hero figure on the cover. |
| `headline` | `string` | The punchy line. Always present. |
| `body` | `string?` | The concrete "how" beneath the headline. Optional on hook/CTA. |
| `tool` | `string?` | The tool/company this slide is about; resolves to `ctx.logoDataUri` / `ctx.toolDomain` when recognized. |
| `bgImageUrl` | `string?` | Source URL for an optional cover photo, already resolved into `ctx.backgroundDataUri` by the time your renderer runs; you read the context field, not this one. |
| `card` | `SlideCard?` | A structured GitHub-repo or stats card (title, subtitle, avatar, stats, language, languageBar). Rendered by all three starter packs (`gradient-pop`, `paper-light`, `terminal-dev`); `editorial` ignores it. Optional to support in your own pack. |
| `terminal` | `TerminalPanel?` | A few command/output lines (title plus colored `prompt`/`ok`/`warn`/`muted`/`accent`/`comment` lines). Used by `terminal-dev`; optional elsewhere. |

### Safe zones and canvas sizes

`ctx.safeTop/safeRight/safeBottom/safeLeft` are the insets your content
column must respect so the platform's own overlaid UI never clips anything
important: the username/tab row at the top, the engagement rail on the
right, the caption/CTA bar at the bottom. They come from `CAROUSEL_FORMATS`
in `@cmd/brand` and vary by format:

| Format | Canvas | safeTop | safeRight | safeBottom | safeLeft |
|---|---|---|---|---|---|
| `tiktok` (default) | 1080x1920 (9:16) | 264 | 132 | 340 | 96 |
| `instagram` | 1080x1350 (4:5) | 110 | 96 | 130 | 96 |
| `x` | 1080x1080 (1:1) | 92 | 96 | 104 | 96 |

Always read the insets off `ctx` (with a sane fallback, as in the example
above) rather than hardcoding one format's numbers; the same template
renders every format from the same `Slide` data.

### Fonts

Satori has no system-font access, so the renderer bundles WOFF files and
registers them by name and weight (`packages/carousel-render/src/fonts.ts`).
Only these families/weights are available:

- **Sora**: 700, 800 (display/headline face)
- **Inter**: 400, 600 (body face)
- **JetBrains Mono**: 400, 700 (used by `terminal-dev` for prompts/output)

The bundle is a Latin subset only. `clean()` (re-exported from
`template-api`) maps arrow glyphs (`→`, `➔`, etc.) to the word "to" and
strips emoji, pictographs, and CJK/Kana/Hangul/fullwidth characters that
would otherwise render as tofu boxes. The registry auto-cleans
`headline`/`body`/`kicker`/`coverStat`; call it yourself on anything else
you render (see rule 8 above).

### Brand tokens

`@cmd/brand` is the single source of truth for the visual identity, and it's
safe to import from a template; every builtin does:

- **`BRAND_COLORS`**: the palette (`primary`, `secondary`, `accent`,
  `bgDark`/`bgDarkAlt`, `text`/`textDim`/`textFaint`, `bgLight`,
  `textOnLight`). The three main accents are `BRAND_*_COLOR`-overridable env
  vars with neutral defaults; the rest is fixed.
- **`BRAND_GRADIENT`**: gradient stop pairs (`hero`, `cool`, `scrim`) used
  for backgrounds and scrims over cover photos.
- **`BRAND_IDENTITY`**: account identity (`handle`, `displayName`,
  `ctaLabel`, `tagline`, etc.), all `BRAND_*` env-var overridable so a fresh
  clone renders with a neutral placeholder identity out of the box.

Using these tokens instead of hardcoded hex values means your pack
automatically reflects whatever colors and identity a given deployment has
configured, rather than shipping a fixed look that fights the rest of the
brand kit.

## Testing your template

The fastest check is a real render. Drop a small deck JSON somewhere (a
scratch file is fine; it doesn't need to live in `apps/control-plane/scripts/decks/`)
using your template's id as `style`:

```jsonc
{
  "style": "my-style",
  "format": "tiktok",
  "caption": "...", "hashtags": [],
  "slides": [
    { "role": "hook", "headline": "A test headline", "body": "..." },
    { "role": "body", "headline": "A body slide", "body": "..." },
    { "role": "cta", "headline": "Save this", "body": "..." }
  ]
}
```

Then render it:

```bash
pnpm tsx scripts/render-carousel.mts <deck.json> <output-dir>
```

No DB is needed for this: it's pure compute from JSON to JPEG bytes on
disk. Check the output JPEGs for the usual failure modes: tofu boxes (an
unbundled font or un-cleaned emoji/CJK), clipped text (safe-zone insets not
respected), or a thrown error (usually a missing `display: "flex"`, or an
`<img>` built through `h()` instead of as a raw vnode; see rules 1 and 2
above).

For an automated check, mirror the pattern in
`packages/carousel-render/src/render.test.ts`, which loops a spec across
every builtin style/format pair and asserts each output is a valid JPEG at
the expected size:

```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderCarousel } from "@cmd/carousel-render";
import type { CarouselSpec } from "@cmd/carousel-render";

const SPEC: CarouselSpec = {
  caption: "", hashtags: [],
  slides: [
    { role: "hook", headline: "Test hook", body: "..." },
    { role: "body", headline: "Test body", body: "..." },
    { role: "cta", headline: "Test cta", body: "..." },
  ],
};

it("renders my-style at TikTok size", async () => {
  const slides = await renderCarousel(SPEC, { style: "my-style", format: "tiktok" });
  expect(slides).toHaveLength(3);
  for (const s of slides) {
    const meta = await sharp(Buffer.from(s.data)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  }
});
```

Run the package's test suite with `pnpm --filter @cmd/carousel-render test`.

## Premium packs

Official premium packs install exactly the same way as any other pack:
unzip into `packages/carousel-render/templates/`, run `pnpm templates:sync`,
restart. There's no separate installer and no code changes: a paid pack is
just a `.ts` file (or a few) that happens to have been written by someone
else. Find them at the project's template store (link in the README when
available).

---

[Docs index](README.md) · [Project README](../README.md) · [Follow @ty.prompts.ai on TikTok](https://www.tiktok.com/@ty.prompts.ai)
