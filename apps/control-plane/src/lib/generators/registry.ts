import {
  GeneratorRegistry,
  StubGenerator,
  type Generator,
  type GeneratorHealth,
} from "@cmd/generation";
import type { ContentType } from "@cmd/contracts";
import { env } from "../env.js";
import { OssClipperGenerator, HiggsfieldGenerator } from "./http-generators.js";
import { CarouselComposer } from "./carousel-composer.js";

/**
 * The OpusClip manual lane (§3B/§6): we keep a subscription for hands-on quality
 * work, but the automated pipeline runs on engines we control. Marked `manual`
 * so the registry never auto-routes to it — it's reachable only by explicit pin,
 * and even then it tells you to do it by hand.
 */
class OpusClipManualLane implements Generator {
  readonly name = "opusclip";
  readonly engine = "opusclip";
  readonly supports: ContentType[] = ["clip", "video"];
  readonly manual = true;
  async healthcheck(): Promise<GeneratorHealth> {
    return "ok";
  }
  async generate(): Promise<never> {
    throw new Error("OpusClip is a manual lane — produce clips by hand and upload them");
  }
}

/**
 * Build the generator registry from the environment. The in-process StubGenerator
 * is always present so dev/CI can exercise the full pipeline; the real HTTP
 * engines register only when configured.
 */
export function buildRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry();

  // The CarouselComposer is the DEFAULT lane for carousels — registered FIRST so
  // the registry routes carousel briefs here ahead of Higgsfield/stub. It's
  // self-contained (LLM has a stub fallback, rendering is local) so it's always
  // healthy.
  registry.register(new CarouselComposer());

  const clipperUrl = env.clipperApiUrl();
  if (clipperUrl) {
    registry.register(
      new OssClipperGenerator({ baseUrl: clipperUrl, apiKey: env.clipperApiKey() }),
    );
  }

  const higgsUrl = env.higgsfieldApiUrl();
  if (higgsUrl) {
    registry.register(
      new HiggsfieldGenerator({ baseUrl: higgsUrl, apiKey: env.higgsfieldApiKey() }),
    );
  }

  registry.register(new OpusClipManualLane());

  // Dev/CI fallback so generation works before external engines are wired.
  if (!clipperUrl && !higgsUrl) {
    registry.register(new StubGenerator());
  }

  return registry;
}
