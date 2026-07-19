import type { GenerationBrief } from "@cmd/generation";
import type { ContentItem, Prisma } from "@cmd/db";
import { createContent } from "./content-service.js";
import { buildRegistry } from "./generators/registry.js";

/**
 * The Generation service (roadmap §3 / Phase 3). Turns a plain-English brief into
 * draft content via whichever engine the registry routes to, then drops each
 * produced asset into the spine as a `draft` ContentItem — so generated content
 * flows through the SAME Phase-1 approval gate as everything else. The machine
 * makes it; a human still presses the button before it goes public.
 */

export interface GenerationOutcome {
  engine: string;
  items: ContentItem[];
}

export interface RunGenerationOptions {
  /** Scheduled publish times to stamp onto each draft (e.g. from a recipe). */
  scheduleSlots?: Array<Date | null>;
  /** Who/what requested this (defaults to "generation:<engine>"). */
  createdBy?: string;
}

export async function runGeneration(
  brief: GenerationBrief,
  options: RunGenerationOptions = {},
): Promise<GenerationOutcome> {
  const registry = buildRegistry();
  const generator = await registry.select(brief); // throws NoGeneratorAvailableError
  const result = await generator.generate(brief);

  const items: ContentItem[] = [];
  for (const [i, asset] of result.assets.entries()) {
    const scheduledAt = options.scheduleSlots?.[i] ?? null;
    const item = await createContent({
      type: asset.type,
      brandSurface: brief.brandSurface,
      title: asset.title?.slice(0, 120) || asset.caption?.slice(0, 120) || brief.prompt.slice(0, 120),
      payload: {
        content: asset.caption ?? brief.prompt,
        engine: result.engine,
        sourceUrl: brief.sourceUrl ?? null,
        generationMetadata: asset.metadata ?? {},
        // Follow-up tweets (e.g. a reply carrying the source article link).
        ...(asset.thread?.length ? { thread: asset.thread } : {}),
        // Carry a desired schedule so the human can keep or change it on approval.
        ...(scheduledAt ? { desiredScheduledAt: scheduledAt.toISOString() } : {}),
      } as unknown as Prisma.InputJsonValue,
      // Carousels carry every slide in `assetUrls`; single-asset engines fall
      // back to the lone `url`.
      assetUrls: asset.assetUrls?.length ? asset.assetUrls : asset.url ? [asset.url] : [],
      createdBy: options.createdBy ?? `generation:${result.engine}`,
      status: "draft",
    });
    items.push(item);
  }

  return { engine: result.engine, items };
}
