import { isToolName } from "./tools.js";
import type { OrchestrationPlan, ToolCall } from "./types.js";

/**
 * Minimal shape of an Anthropic message content block we care about. Kept local
 * so this package has no SDK dependency — the control plane passes the real
 * response blocks through. Unknown block types are ignored.
 */
export interface AnthropicBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Turn the content blocks of one Claude assistant turn into an OrchestrationPlan:
 * text blocks become the summary, `tool_use` blocks become steps. Tool calls for
 * names outside our catalog are dropped (the model can't invent actions). Pure,
 * so it's unit-testable without the SDK.
 */
export function toolUsesToPlan(
  blocks: AnthropicBlock[],
  plannerName = "claude",
): OrchestrationPlan {
  const summary = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!.trim())
    .join(" ")
    .trim();

  const steps: ToolCall[] = blocks
    .filter((b) => b.type === "tool_use" && isToolName(b.name))
    .map((b) => ({
      tool: b.name as ToolCall["tool"],
      args: b.input ?? {},
    }));

  return {
    summary: summary || (steps.length ? "Execute the planned content actions." : "No action needed."),
    steps,
    planner: plannerName,
  };
}

/**
 * Minimal shape of an OpenAI/OpenRouter chat-completions message (the planner
 * runs through OpenRouter's OpenAI-compatible API). `content` is the summary;
 * `tool_calls[].function.{name, arguments}` are the steps (arguments is a JSON
 * string). Kept local so this package stays dependency-free.
 */
export interface OpenAiToolCall {
  function?: { name?: string; arguments?: string };
}
export interface OpenAiMessage {
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}

/**
 * Turn an OpenAI/OpenRouter assistant message into an OrchestrationPlan. Pure and
 * SDK-free, so it's unit-testable. Tool calls outside the catalog are dropped;
 * malformed JSON arguments degrade to an empty args object.
 */
export function openAiToolCallsToPlan(
  message: OpenAiMessage,
  plannerName = "openrouter",
): OrchestrationPlan {
  const summary = (message.content ?? "").trim();
  const steps: ToolCall[] = (message.tool_calls ?? [])
    .filter((c) => isToolName(c.function?.name))
    .map((c) => {
      let args: Record<string, unknown> = {};
      try {
        args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = {};
      }
      return { tool: c.function!.name as ToolCall["tool"], args };
    });

  return {
    summary: summary || (steps.length ? "Execute the planned content actions." : "No action needed."),
    steps,
    planner: plannerName,
  };
}

/** The system prompt that frames Claude as the content-ops orchestrator. */
export const ORCHESTRATOR_SYSTEM_PROMPT = [
  "You are the Content Management Dashboard orchestrator.",
  "Turn the user's plain-English request into tool calls using ONLY the provided tools.",
  "Rules:",
  "- You may generate and queue content, but you can NEVER publish; everything you make is",
  "  held for human approval. There is no publish tool by design.",
  "- Prefer run_recipe when the request clearly matches an existing recipe; otherwise use",
  "  generate_content.",
  "- Respect explicit counts and sources in the request.",
  "- Emit one short sentence of plain-English summary, then the tool calls.",
].join("\n");
