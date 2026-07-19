import type {
  GenerationBrief,
  GenerationResult,
  Generator,
  GeneratorHealth,
} from "@cmd/generation";
import type { ContentType } from "@cmd/contracts";

/**
 * Real HTTP adapters for the external generation engines, both behind the same
 * `Generator` contract. They're configured by URL/key and call the engine's API
 * — we never embed engine internals. Each ships with a healthcheck so the
 * registry's circuit breaker can route around a degraded engine.
 */

interface HttpGeneratorOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string | undefined,
  body: unknown,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) throw new Error(`generator ${url} failed: ${res.status}`);
  return json;
}

async function pingHealth(
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<GeneratorHealth> {
  try {
    const res = await fetchImpl(`${baseUrl}/health`, { method: "GET" });
    return res.ok ? "ok" : "degraded";
  } catch {
    return "down";
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * OSS clipper adapter (SamurAIGPT/AI-Youtube-Shorts-Generator, §3B): LLM
 * highlight detection + Whisper transcription + auto 9:16 cropping. Expects a
 * small HTTP wrapper exposing POST /generate → { clips: [{ url, caption }] }.
 */
export class OssClipperGenerator implements Generator {
  readonly name = "oss-clipper";
  readonly engine = "oss_clipper";
  readonly supports: ContentType[] = ["clip", "video"];
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpGeneratorOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  healthcheck(): Promise<GeneratorHealth> {
    return pingHealth(this.fetchImpl, this.baseUrl);
  }

  async generate(brief: GenerationBrief): Promise<GenerationResult> {
    const json = (await postJson(this.fetchImpl, `${this.baseUrl}/generate`, this.apiKey, {
      source_url: brief.sourceUrl,
      count: brief.count ?? 1,
      prompt: brief.prompt,
    })) as { clips?: Array<{ url: string; caption?: string; [k: string]: unknown }> };

    const assets = (json.clips ?? []).map((c) => ({
      url: c.url,
      type: brief.type,
      caption: c.caption,
      metadata: c,
    }));
    return { engine: this.engine, assets, raw: json };
  }
}

/**
 * Higgsfield adapter (§3D): primary generative engine for imagery/video. Already
 * MCP-connected in production; here it's an HTTP adapter behind the same contract.
 */
export class HiggsfieldGenerator implements Generator {
  readonly name = "higgsfield";
  readonly engine = "higgsfield";
  readonly supports: ContentType[] = ["video", "clip", "carousel", "post"];
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpGeneratorOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  healthcheck(): Promise<GeneratorHealth> {
    return pingHealth(this.fetchImpl, this.baseUrl);
  }

  async generate(brief: GenerationBrief): Promise<GenerationResult> {
    const json = (await postJson(this.fetchImpl, `${this.baseUrl}/generate`, this.apiKey, {
      prompt: brief.prompt,
      type: brief.type,
      count: brief.count ?? 1,
    })) as { assets?: Array<{ url: string; caption?: string; [k: string]: unknown }> };

    const assets = (json.assets ?? []).map((a) => ({
      url: a.url,
      type: brief.type,
      caption: a.caption,
      metadata: a,
    }));
    return { engine: this.engine, assets, raw: json };
  }
}
