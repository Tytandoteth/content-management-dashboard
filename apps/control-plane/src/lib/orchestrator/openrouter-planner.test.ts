import { describe, expect, it, vi } from "vitest";
import { OpenRouterPlanner } from "./openrouter-planner.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenRouterPlanner", () => {
  it("sends tools + system prompt and maps the completion to a plan", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: "I'll make 8 clips and hold them for approval.",
              tool_calls: [
                { function: { name: "generate_content", arguments: JSON.stringify({ type: "clip", count: 8, prompt: "x" }) } },
                { function: { name: "publish_now", arguments: "{}" } }, // not in catalog → dropped
              ],
            },
          },
        ],
      }),
    );
    const planner = new OpenRouterPlanner({
      apiKey: "k", model: "anthropic/claude-sonnet-4",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const plan = await planner.plan("8 clips from the pod", { recipeSlugs: ["podcast-to-clips"] });

    expect(plan.planner).toBe("openrouter");
    expect(plan.summary).toContain("8 clips");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.tool).toBe("generate_content");
    expect(plan.steps[0]!.args).toMatchObject({ count: 8 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("anthropic/claude-sonnet-4");
    expect(sent.tools).toHaveLength(2);
    expect(sent.tool_choice).toBe("auto");
    expect(sent.messages[1].content).toContain("podcast-to-clips");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer k" });
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 401));
    const planner = new OpenRouterPlanner({ apiKey: "k", model: "m", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(planner.plan("x", { recipeSlugs: [] })).rejects.toThrow(/OpenRouter 401/);
  });
});
