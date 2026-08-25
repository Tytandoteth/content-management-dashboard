import type {
  GenerationBrief,
  GenerationResult,
  Generator,
  GeneratorHealth,
} from "./types.js";

/**
 * A deterministic in-process generator for dev and tests — no external service.
 * Produces `count` placeholder assets derived from the brief, so the whole
 * generation → approval → publish pipeline can be exercised before the real
 * OSS clipper / Higgsfield endpoints are wired up.
 */
/** Upper bound on assets one brief can produce. A bad count (a year scraped out
 *  of a request, an LLM hallucinating 5000) must not turn into 5000 DB rows. */
export const MAX_STUB_ASSETS = 10;

export class StubGenerator implements Generator {
  readonly name = "stub";
  readonly engine = "stub";
  readonly supports = ["clip", "video", "tweet", "thread", "carousel", "post"] as const as never;

  constructor(private readonly health: GeneratorHealth = "ok") {}

  async healthcheck(): Promise<GeneratorHealth> {
    return this.health;
  }

  async generate(brief: GenerationBrief): Promise<GenerationResult> {
    const requested = Number.isFinite(brief.count) ? Math.round(brief.count as number) : 1;
    const count = Math.max(1, Math.min(MAX_STUB_ASSETS, requested));
    const assets = Array.from({ length: count }, (_, i) => ({
      url: `stub://${brief.type}/${i + 1}`,
      type: brief.type,
      caption: `${brief.prompt} — ${brief.type} ${i + 1}/${count}`,
      metadata: { stub: true, index: i + 1, sourceUrl: brief.sourceUrl ?? null },
    }));
    return { engine: this.engine, assets };
  }
}
