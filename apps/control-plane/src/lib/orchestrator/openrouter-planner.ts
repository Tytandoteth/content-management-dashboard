import {
  ORCHESTRATOR_TOOLS,
  ORCHESTRATOR_SYSTEM_PROMPT,
  openAiToolCallsToPlan,
  type OrchestrationPlan,
  type Planner,
  type PlannerContext,
} from "@cmd/orchestrator";

/**
 * The production planner: OpenRouter (OpenAI-compatible chat-completions with
 * tool-calling) turns a plain-English request into tool calls.
 *
 * Uses fetch only — no SDK. `fetchImpl` is injectable so it's unit-testable
 * without a key (pass a stub returning a canned completion). The model is any
 * OpenRouter model id (e.g. "anthropic/claude-sonnet-4", "openai/gpt-4o-mini").
 */
export interface OpenRouterPlannerOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown[] } }>;
}

export class OpenRouterPlanner implements Planner {
  readonly name = "openrouter";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenRouterPlannerOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async plan(request: string, context: PlannerContext): Promise<OrchestrationPlan> {
    const tools = ORCHESTRATOR_TOOLS.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        // OpenRouter attribution headers (optional but recommended).
        "x-title": "content-management-dashboard",
      },
      body: JSON.stringify({
        model: this.model,
        tools,
        tool_choice: "auto",
        messages: [
          { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Available recipes: ${context.recipeSlugs.join(", ") || "none"}.\n\n` +
              `Request: ${request}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as ChatCompletion;
    const message = json.choices?.[0]?.message ?? {};
    return openAiToolCallsToPlan(message as never, this.name);
  }
}
