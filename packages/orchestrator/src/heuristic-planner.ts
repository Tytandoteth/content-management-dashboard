import type { ContentType } from "@cmd/contracts";
import type { OrchestrationPlan, Planner, PlannerContext, ToolCall } from "./types.js";

/**
 * A deterministic, dependency-free planner. It covers the marquee requests from
 * the roadmap ("turn this podcast into 8 clips and queue them", "write an X
 * thread about …", "run the <recipe> recipe") and is the fallback whenever no
 * LLM is configured — so the orchestrator always works, just less flexibly. It
 * is also what the unit tests pin behavior against.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const TYPE_PATTERNS: Array<[RegExp, ContentType]> = [
  [/\bclips?\b|\bshorts?\b/, "clip"],
  [/\breels?\b|\bvideos?\b/, "video"],
  [/\bcarousels?\b/, "carousel"],
  [/\bthreads?\b/, "thread"],
  [/\btweets?\b/, "tweet"],
  [/\bposts?\b/, "post"],
];

const URL_RE = /https?:\/\/[^\s)]+/;
const RUN_VERB_RE = /\b(run|use|kick off|trigger)\b/;

function detectType(text: string): ContentType {
  for (const [re, type] of TYPE_PATTERNS) if (re.test(text)) return type;
  return "post";
}

function detectCount(text: string): number | undefined {
  const digit = text.match(/\b(\d{1,4})\b/);
  if (digit) return Number(digit[1]);
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return n;
  }
  return undefined;
}

/** Match a recipe slug by its distinctive tokens appearing in the request. */
function matchRecipe(text: string, slugs: string[]): string | undefined {
  for (const slug of slugs) {
    if (text.includes(slug)) return slug;
    const tokens = slug.split("-").filter((t) => t.length > 3);
    if (tokens.length > 0 && tokens.every((t) => text.includes(t))) return slug;
  }
  return undefined;
}

export class HeuristicPlanner implements Planner {
  readonly name = "heuristic";

  async plan(request: string, context: PlannerContext): Promise<OrchestrationPlan> {
    const text = request.toLowerCase();
    const url = request.match(URL_RE)?.[0];

    // Recipe path: an explicit run verb + a recognizable recipe.
    if (RUN_VERB_RE.test(text)) {
      const slug = matchRecipe(text, context.recipeSlugs);
      if (slug) {
        const step: ToolCall = {
          tool: "run_recipe",
          args: { slug, ...(url ? { sourceUrl: url } : {}) },
          reason: `Request asks to run the "${slug}" recipe.`,
        };
        return {
          summary: `Run the ${slug} recipe${url ? ` on ${url}` : ""}.`,
          steps: [step],
          planner: this.name,
        };
      }
    }

    // Default: a single generate_content step.
    const type = detectType(text);
    const count = detectCount(text);
    const step: ToolCall = {
      tool: "generate_content",
      args: {
        type,
        prompt: request.trim(),
        ...(count ? { count } : {}),
        ...(url ? { sourceUrl: url } : {}),
      },
      reason: `Generate ${count ?? 1} ${type}(s) from the request.`,
    };
    const queued = /\b(queue|schedule|drip)\b/.test(text);
    return {
      summary: `Generate ${count ?? 1} ${type}${(count ?? 1) > 1 ? "s" : ""}${
        queued ? " and hold them in the approval queue" : " for approval"
      }.`,
      steps: [step],
      planner: this.name,
    };
  }
}
