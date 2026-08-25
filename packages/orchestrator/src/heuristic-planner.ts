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

/** Nobody asks a chat box for more than ten drafts in one go, and an unbounded
 *  count is a runaway generation bill. Counts are clamped to this. */
export const MAX_PLANNED_COUNT = 10;

/**
 * Type routing. `carousel` is matched FIRST: "a carousel about AI video tools"
 * is a carousel request, and the topic words ("video", "clips") must not steal
 * the routing and send it to a different engine.
 */
const TYPE_PATTERNS: Array<[RegExp, ContentType]> = [
  [/\bcarousels?\b/, "carousel"],
  [/\bclips?\b|\bshorts?\b/, "clip"],
  [/\breels?\b|\bvideos?\b/, "video"],
  [/\bthreads?\b/, "thread"],
  [/\btweets?\b/, "tweet"],
  [/\bposts?\b/, "post"],
];

const URL_RE = /https?:\/\/[^\s)]+/;
const URL_GLOBAL_RE = /https?:\/\/\S+/g;
const RUN_VERB_RE = /\b(run|use|kick off|trigger)\b/;

/**
 * Words a number has to be sitting next to before we read it as "how many".
 * Without this guard any digit run in the text became the count, so "a post
 * about the 2026 election" planned 2026 items and a source URL's digits leaked
 * into the count too.
 */
const COUNT_NOUNS =
  "carousels?|posts?|clips?|videos?|shorts?|reels?|threads?|tweets?|items?|slides?|pieces?";
const DIGIT_COUNT_RE = new RegExp(`\\b(\\d{1,2})\\s*(?:${COUNT_NOUNS})\\b`);

/**
 * Clauses the heuristic planner cannot honor. It can only ever produce drafts,
 * so a request that also asks for scheduling or publishing gets told so rather
 * than silently dropping half of what was asked for.
 */
const UNAUTOMATED_RE =
  /\b(schedule[sd]?|scheduling|publish(?:es|ed|ing)?|go live|auto-?post(?:s|ed|ing)?|drip)\b/;

export const AUTOMATION_NOTE =
  "Note: scheduling and publishing are not automated from chat; drafts are held for approval.";

function clampCount(n: number): number {
  return Math.max(1, Math.min(MAX_PLANNED_COUNT, Math.round(n)));
}

function detectType(text: string): ContentType {
  for (const [re, type] of TYPE_PATTERNS) if (re.test(text)) return type;
  return "post";
}

function detectCount(text: string): number | undefined {
  // URLs carry digits (dates, episode numbers) that are not counts.
  const clean = text.replace(URL_GLOBAL_RE, " ");
  const digit = clean.match(DIGIT_COUNT_RE);
  if (digit) return clampCount(Number(digit[1]));
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\s*(?:${COUNT_NOUNS})\\b`).test(clean)) return clampCount(n);
  }
  return undefined;
}

/** Match a recipe slug by its distinctive tokens appearing in the request. */
function matchRecipe(text: string, slugs: string[]): string | undefined {
  for (const slug of slugs) {
    // `text` is already lowercased; slugs come from the DB and may not be.
    const lower = slug.toLowerCase();
    if (text.includes(lower)) return slug;
    const tokens = lower.split("-").filter((t) => t.length > 3);
    if (tokens.length > 0 && tokens.every((t) => text.includes(t))) return slug;
  }
  return undefined;
}

export class HeuristicPlanner implements Planner {
  readonly name = "heuristic";

  async plan(request: string, context: PlannerContext): Promise<OrchestrationPlan> {
    const text = request.toLowerCase();
    const url = request.match(URL_RE)?.[0];
    const note = UNAUTOMATED_RE.test(text) ? AUTOMATION_NOTE : undefined;
    const withNote = (summary: string) => (note ? `${summary} ${note}` : summary);

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
          summary: withNote(`Run the ${slug} recipe${url ? ` on ${url}` : ""}.`),
          steps: [step],
          planner: this.name,
          ...(note ? { note } : {}),
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
      summary: withNote(
        `Generate ${count ?? 1} ${type}${(count ?? 1) > 1 ? "s" : ""}${
          queued ? " and hold them in the approval queue" : " for approval"
        }.`,
      ),
      steps: [step],
      planner: this.name,
      ...(note ? { note } : {}),
    };
  }
}
