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
 * Dropping an out-of-catalog tool call silently made the plan a lie: the model
 * asked to publish, we quietly refused, and the user saw a plan that never
 * mentioned it. We surface the dropped names as a plan-level note (the lighter
 * of the two options — the alternative, synthesizing a failed StepResult per
 * dropped call, would make an unexecuted preview report failures it never had).
 * The note is also appended to the summary so every existing consumer shows it.
 */
function droppedNote(names: Array<string | undefined>): string | undefined {
  const dropped = [...new Set(names.filter((n): n is string => typeof n === "string" && !!n))];
  if (dropped.length === 0) return undefined;
  return `Ignored ${dropped.length} unsupported tool call${dropped.length > 1 ? "s" : ""} (${dropped.join(", ")}); there is no publish tool by design.`;
}

/**
 * Turn the content blocks of one Claude assistant turn into an OrchestrationPlan:
 * text blocks become the summary, `tool_use` blocks become steps. Tool calls for
 * names outside our catalog are dropped (the model can't invent actions) and
 * reported in `note`. Pure, so it's unit-testable without the SDK.
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

  const toolBlocks = blocks.filter((b) => b.type === "tool_use");
  const steps: ToolCall[] = toolBlocks
    .filter((b) => isToolName(b.name))
    .map((b) => ({
      tool: b.name as ToolCall["tool"],
      args: b.input ?? {},
    }));
  const note = droppedNote(toolBlocks.filter((b) => !isToolName(b.name)).map((b) => b.name));

  const base = summary || (steps.length ? "Execute the planned content actions." : "No action needed.");
  return {
    summary: note ? `${base} ${note}` : base,
    steps,
    planner: plannerName,
    ...(note ? { note } : {}),
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
 * SDK-free, so it's unit-testable. Tool calls outside the catalog are dropped and
 * reported in `note`; malformed JSON arguments degrade to an empty args object.
 */
export function openAiToolCallsToPlan(
  message: OpenAiMessage,
  plannerName = "openrouter",
): OrchestrationPlan {
  const summary = (message.content ?? "").trim();
  const calls = message.tool_calls ?? [];
  const steps: ToolCall[] = calls
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
  const note = droppedNote(
    calls.filter((c) => !isToolName(c.function?.name)).map((c) => c.function?.name),
  );

  const base = summary || (steps.length ? "Execute the planned content actions." : "No action needed.");
  return {
    summary: note ? `${base} ${note}` : base,
    steps,
    planner: plannerName,
    ...(note ? { note } : {}),
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
