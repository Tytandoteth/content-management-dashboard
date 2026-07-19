import type { GenerationBrief, Generator, GeneratorHealth } from "./types.js";

/**
 * Holds the registered generators and routes a brief to a healthy one.
 *
 * Routing mirrors a circuit breaker: if the clip generator is degraded or
 * down, the registry skips it and routes to the next capable engine instead of
 * failing the whole request. Selection is health-aware and explicit-engine
 * aware (a brief may pin an engine by name).
 */
export class NoGeneratorAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoGeneratorAvailableError";
  }
}

export class GeneratorRegistry {
  private readonly generators: Generator[] = [];

  register(generator: Generator): this {
    if (this.generators.some((g) => g.name === generator.name)) {
      throw new Error(`Generator "${generator.name}" is already registered`);
    }
    this.generators.push(generator);
    return this;
  }

  list(): Generator[] {
    return [...this.generators];
  }

  get(name: string): Generator | undefined {
    return this.generators.find((g) => g.name === name);
  }

  /**
   * Candidates for a brief, in priority order: an explicitly-pinned engine wins;
   * otherwise all non-manual generators that support the brief's content type.
   * Pure — no health checks — so it's trivially testable.
   */
  candidates(brief: GenerationBrief): Generator[] {
    if (brief.engine) {
      const pinned = this.generators.find(
        (g) => g.name === brief.engine || g.engine === brief.engine,
      );
      return pinned ? [pinned] : [];
    }
    return this.generators.filter(
      (g) => !g.manual && g.supports.includes(brief.type),
    );
  }

  /**
   * Pick the first candidate that is healthy enough to use, skipping `down`
   * engines (circuit breaker). `degraded` is accepted only if nothing is `ok`.
   * Throws NoGeneratorAvailableError if every candidate is down/unreachable.
   */
  async select(brief: GenerationBrief): Promise<Generator> {
    const candidates = this.candidates(brief);
    if (candidates.length === 0) {
      throw new NoGeneratorAvailableError(
        brief.engine
          ? `No generator named/engine "${brief.engine}"`
          : `No generator supports content type "${brief.type}"`,
      );
    }

    const health = await Promise.all(
      candidates.map(async (g) => {
        try {
          return [g, await g.healthcheck()] as const;
        } catch {
          return [g, "down" as GeneratorHealth] as const;
        }
      }),
    );

    const ok = health.find(([, h]) => h === "ok");
    if (ok) return ok[0];
    const degraded = health.find(([, h]) => h === "degraded");
    if (degraded) return degraded[0];

    throw new NoGeneratorAvailableError(
      `All ${candidates.length} candidate generator(s) for "${brief.type}" are down`,
    );
  }
}
