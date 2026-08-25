import { randomUUID } from "node:crypto";
import type {
  GeneratedAsset,
  GenerationBrief,
  GenerationResult,
  Generator,
  GeneratorHealth,
} from "@cmd/generation";
import type { ContentType } from "@cmd/contracts";
import type { CarouselSpec, CarouselStyle } from "@cmd/carousel-render";
import { composeSpec } from "../carousel/compose.js";
import { buildBackgroundProvider } from "../carousel/background.js";
import { renderAndStore } from "../carousel/store.js";
import { generateLongformArticle } from "../longform.js";

/**
 * A stable, human-readable title for the content item. `spec.topic` just
 * echoes whatever prompt the caller passed in — usually a short topic, but
 * sometimes a long grounding paragraph (e.g. fact-checked launch copy handed
 * to the composer) that makes a poor title. Prefer the hook slide instead:
 * the composer is instructed to keep it short (coverStat ≤ ~10 chars,
 * headline ≤ 7 words), so it reads as a title regardless of prompt length.
 */
function titleFromSpec(spec: CarouselSpec): string | null {
  const hook = spec.slides.find((s) => s.role === "hook");
  if (hook) {
    const title = [hook.coverStat, hook.headline].filter(Boolean).join(" — ").trim();
    if (title) return title.slice(0, 120);
  }
  const topic = spec.topic?.trim();
  if (topic && topic.length <= 100 && !topic.includes("\n")) return topic;
  return null;
}

/**
 * Upper bound on carousels per brief. Each one is a full LLM compose plus two
 * Satori render passes (TikTok + Instagram), so this is what keeps a single
 * request inside the route's 60s budget.
 */
const MAX_CAROUSELS_PER_BRIEF = 5;

/**
 * The carousel engine. Behind the standard Generator contract:
 *
 *   topic/brief → Claude writes the slide deck (composeSpec)
 *              → BackgroundProvider resolves AI/gradient backgrounds
 *              → Satori renders branded PNGs, stored for preview (renderAndStore)
 *              → one GenerationResult asset per carousel, each carrying every
 *                slide URL + caption
 *
 * Those assets flow through generation-service → createContent as `draft`
 * carousels, hitting the SAME approval gate as everything else.
 *
 * `brief.count` is the NUMBER OF CAROUSELS, matching every other generator (and
 * matching what plans say: "Generate 3 carousels" now makes 3 carousels). It
 * used to be quietly reinterpreted as the slide count, so an orchestrator plan
 * promising 3 carousels produced one 3-slide deck. Slides per carousel are set
 * by `brief.metadata.slideCount`; without it the composer uses its own default,
 * which the topic's own promised count ("5 AI tools") can still override.
 */
export class CarouselComposer implements Generator {
  readonly name = "carousel-composer";
  readonly engine = "carousel_composer";
  readonly supports: ContentType[] = ["carousel"];

  async healthcheck(): Promise<GeneratorHealth> {
    // Self-contained (LLM has a deterministic fallback; renderer is local), so
    // it's always available — never the reason a carousel can't be produced.
    return "ok";
  }

  async generate(brief: GenerationBrief): Promise<GenerationResult> {
    // Visual style is chosen at generation time (e.g. from the dashboard), carried
    // on the brief's metadata. Defaults to the original "editorial" look.
    const style = (brief.metadata?.style as CarouselStyle | undefined) ?? "editorial";
    const rawSlideCount = brief.metadata?.slideCount;
    const slideCount = typeof rawSlideCount === "number" && Number.isFinite(rawSlideCount)
      ? Math.round(rawSlideCount)
      : undefined;

    const requested = Number.isFinite(brief.count) ? Math.round(brief.count as number) : 1;
    const carousels = Math.max(1, Math.min(MAX_CAROUSELS_PER_BRIEF, requested));

    const assets: GeneratedAsset[] = [];
    const specs: CarouselSpec[] = [];
    for (let n = 0; n < carousels; n++) {
      const { asset, spec } = await this.composeOne(brief, style, slideCount);
      assets.push(asset);
      specs.push(spec);
    }

    return {
      engine: this.engine,
      assets,
      // One carousel keeps the original single-spec shape; a batch carries all.
      raw: specs.length === 1 ? { spec: specs[0] } : { specs },
    };
  }

  /** Compose, render and store exactly one carousel. */
  private async composeOne(
    brief: GenerationBrief,
    style: CarouselStyle,
    slideCount: number | undefined,
  ): Promise<{ asset: GeneratedAsset; spec: CarouselSpec }> {
    const spec = await composeSpec(brief.prompt, { ...(slideCount ? { slideCount } : {}) });

    // Hybrid look: resolve a background per slide (gradient by default).
    const bg = buildBackgroundProvider();
    const total = spec.slides.length;
    for (let i = 0; i < spec.slides.length; i++) {
      const slide = spec.slides[i]!;
      const url = await bg.backgroundFor(slide, { index: i + 1, total, topic: spec.topic });
      if (url) slide.bgImageUrl = url;
    }

    const folderId = randomUUID().slice(0, 8);
    const stored = await renderAndStore(folderId, spec, { style }); // TikTok 9:16
    // Instagram feed carousels crop to 4:5 — render a matching set so the same
    // deck posts cleanly to IG. Stored alongside under `<folderId>-ig/`.
    const igStored = await renderAndStore(`${folderId}-ig`, spec, { format: "instagram", style });
    const caption = [spec.caption, spec.hashtags.join(" ")].filter(Boolean).join("\n\n");

    // Every carousel gets a companion long-form article for the resource site,
    // generated once here and stored on the item — the site never calls an LLM.
    const longform = await generateLongformArticle(spec);

    return {
      spec,
      asset: {
        url: stored.files[0] ?? "",
        type: "carousel",
        title: titleFromSpec(spec) ?? brief.prompt,
        caption,
        assetUrls: stored.files,
        metadata: {
          folderId,
          dir: stored.dir,
          topic: spec.topic,
          slideCount: total,
          backgroundProvider: bg.name,
          // The chosen visual style — persisted so re-renders keep it.
          style,
          spec,
          // Instagram 4:5 variant of the same slides (served URLs).
          instagram: igStored.files,
          // Long-form companion article for the resource site's /blog.
          longform,
        },
      },
    };
  }
}
