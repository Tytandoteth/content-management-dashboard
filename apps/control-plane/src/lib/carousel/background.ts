import type { Slide } from "@cmd/carousel-render";
import { env } from "../env.js";

/**
 * The "AI backgrounds" half of the hybrid look. A BackgroundProvider decides
 * what image (if any) sits behind a slide's branded text layer. The renderer
 * composites it under a dark scrim; when a provider returns undefined the
 * renderer falls back to the brand gradient — so generation NEVER blocks on an
 * image service being up.
 */
export interface BackgroundProvider {
  readonly name: string;
  /** Return an image URL for this slide, or undefined to use the brand gradient. */
  backgroundFor(slide: Slide, ctx: { index: number; total: number; topic?: string }): Promise<string | undefined>;
}

/** Default: no image — every slide uses the brand gradient. Deterministic, free. */
export class GradientBackgroundProvider implements BackgroundProvider {
  readonly name = "gradient";
  async backgroundFor(): Promise<string | undefined> {
    return undefined;
  }
}

/**
 * AI backgrounds via an HTTP image engine (the Higgsfield HTTP adapter pattern):
 * POST {baseUrl}/generate { prompt, type:"image", count:1 } → { assets:[{url}] }.
 * Only used when HIGGSFIELD_API_URL is set; falls back to gradient on any error.
 * Backgrounds are abstract/atmospheric so they never fight the foreground text.
 */
export class HttpImageBackgroundProvider implements BackgroundProvider {
  readonly name = "http-image";
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async backgroundFor(
    slide: Slide,
    ctx: { index: number; total: number; topic?: string },
  ): Promise<string | undefined> {
    const prompt =
      `Abstract atmospheric background for a social slide about ${ctx.topic ?? "AI tools"}. ` +
      `Soft magenta-to-violet gradient haze, subtle depth, no text, no logos, no faces, ` +
      `dark enough for white text to sit on top. Mood: ${slide.role === "hook" ? "bold and energetic" : "clean and focused"}.`;
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: this.apiKey } : {}) },
        body: JSON.stringify({ prompt, type: "image", count: 1 }),
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as { assets?: Array<{ url?: string }> };
      return json.assets?.[0]?.url;
    } catch {
      return undefined;
    }
  }
}

/** Pick the provider from the environment. Gradient unless an image engine is wired. */
export function buildBackgroundProvider(): BackgroundProvider {
  const url = env.higgsfieldApiUrl();
  if (url) return new HttpImageBackgroundProvider(url, env.higgsfieldApiKey());
  return new GradientBackgroundProvider();
}
