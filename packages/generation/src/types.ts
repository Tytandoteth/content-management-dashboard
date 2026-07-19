import type { BrandSurface, ContentType } from "@cmd/contracts";

/**
 * The generation adapter contract (roadmap §3 — "the reusable part").
 *
 * Every engine — OSS clipper, Higgsfield, ReelForge, OpusClip-if-ever —
 * implements this one interface:
 *
 *   generate(brief) → { assets, ... }   // async, webhook or poll
 *   healthcheck()   → ok | degraded | down
 *
 * Adding a new engine later (Runway, ElevenLabs voiceover, …) is one adapter.
 * The control plane treats each generator as a tool behind this contract and
 * never couples to a specific engine.
 */

export type GeneratorHealth = "ok" | "degraded" | "down";

/** A plain-English request for content, engine-agnostic. */
export interface GenerationBrief {
  /** Desired output format. */
  type: ContentType;
  brandSurface: BrandSurface;
  /** Plain-English brief / source description ("10 clips from this podcast"). */
  prompt: string;
  /** Source media to transform (e.g. a podcast/video URL for clipping). */
  sourceUrl?: string;
  /** How many assets to produce (e.g. 10 clips). Defaults to 1. */
  count?: number;
  /** Force a specific engine by name; otherwise the registry routes by health. */
  engine?: string;
  metadata?: Record<string, unknown>;
}

export interface GeneratedAsset {
  /** URL of the produced asset (clip, image, render) or empty for text-only. */
  url: string;
  type: ContentType;
  /**
   * For multi-image formats (carousel/photo-mode posts), the ordered list of
   * every slide URL. When present, the generation service stores all of these
   * on the content item; `url` is just the first/cover. Single-asset engines
   * leave this undefined and only set `url`.
   */
  assetUrls?: string[];
  /** Suggested caption/body for the content item. */
  caption?: string;
  /**
   * Human-friendly label for the content item (e.g. the carousel topic). When
   * omitted the generation service falls back to the caption/brief. Keeps the
   * dashboard title clean even when the caption carries hashtags.
   */
  title?: string;
  /**
   * Follow-up posts to publish as a thread after the main caption (e.g. a reply
   * carrying the source article link). Each entry is one additional tweet.
   */
  thread?: string[];
  metadata?: Record<string, unknown>;
}

export interface GenerationResult {
  engine: string;
  assets: GeneratedAsset[];
  /** Raw engine payload, for debugging. */
  raw?: unknown;
}

export interface Generator {
  /** Unique adapter name (e.g. "oss-clipper"). */
  name: string;
  /** Engine family (e.g. "oss_clipper", "higgsfield", "llm_text", "stub"). */
  engine: string;
  /** Content types this engine can produce. */
  supports: ContentType[];
  /**
   * Manual lanes (e.g. OpusClip) are never auto-selected by the registry — the
   * automated pipeline runs on engines we control; manual stays opt-in.
   */
  manual?: boolean;
  generate(brief: GenerationBrief): Promise<GenerationResult>;
  healthcheck(): Promise<GeneratorHealth>;
}
