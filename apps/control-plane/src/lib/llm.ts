import { env } from "./env.js";

/**
 * Generic LLM call shared across features (carousel composer, comment replies).
 * Prefers OpenRouter when configured, else a direct Anthropic key, else null so
 * callers can fall back to a deterministic stub. Mirrors the provider logic in
 * carousel/compose.ts.
 */

export type LlmProvider = "openrouter" | "anthropic";

export function pickProvider(): LlmProvider | null {
  if (env.openrouterApiKey()) return "openrouter";
  if (env.anthropicApiKey()) return "anthropic";
  return null;
}

export interface CallLlmOptions {
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

/** One LLM call → raw text. Returns null when no provider key is configured. */
export async function callLLM(system: string, user: string, options: CallLlmOptions = {}): Promise<string | null> {
  const provider = pickProvider();
  if (!provider) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxTokens = options.maxTokens ?? 600;

  if (provider === "anthropic") {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.anthropicModel(),
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`LLM Anthropic ${res.status}`);
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    // Current Claude models run adaptive thinking by default, so content[0] may
    // be a thinking block — pick the text block, wherever it sits.
    return (json.content?.find((b) => b.type === "text")?.text ?? "").trim();
  }

  const res = await fetchImpl(`${env.openrouterBaseUrl().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.openrouterApiKey()}`,
      "x-title": "content-management-dashboard",
    },
    body: JSON.stringify({
      model: env.orchestratorModel(),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}
