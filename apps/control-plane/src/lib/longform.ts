import type { CarouselSpec } from "@cmd/carousel-render";
import { toolUrlFor, noEmDash, BRAND_IDENTITY } from "@cmd/brand";
import { env } from "./env.js";

/**
 * The long-form article writer. Every carousel's short, punchy slide copy gets
 * expanded into a full blog post for the resource site — one detailed section per
 * item (repo, tool, or step), grounded in the SAME facts the carousel already
 * shows (stats, links, descriptions) so the model explains and contextualizes
 * rather than invents. Stored once on the ContentItem (payload.generationMetadata.longform)
 * so the resource site never has to call an LLM at request time.
 */

export interface LongformSection {
  heading: string;
  /** "owner/repo" when this section is about a GitHub repo. */
  repoFullName?: string;
  /** The real, grounded link for this section (GitHub repo, tool site, etc). */
  url?: string;
  /** 2-4 paragraphs, separated by "\n\n". */
  body: string;
}

export interface LongformArticle {
  title: string;
  /** One-sentence subtitle/dek under the title. */
  dek: string;
  /** Opening paragraphs (1-2), separated by "\n\n". */
  intro: string;
  sections: LongformSection[];
  /** Closing paragraph(s), separated by "\n\n". */
  conclusion: string;
}

interface RepoItem {
  headline: string;
  fullName?: string;
  /** The tool this slide is about (e.g. "Opus Clips"), when not a repo. */
  tool?: string;
  /** Grounded destination link — GitHub for repos, the tool's site otherwise. */
  url?: string;
  description?: string;
  stats?: Array<{ label: string; value: string }>;
  body?: string;
}

/** Pull the grounding facts (repo links, stats, descriptions) out of a spec's body slides. */
function itemsFromSpec(spec: CarouselSpec): RepoItem[] {
  return spec.slides
    .filter((s) => s.role === "body")
    .map((s) => {
      const fullName = s.card?.kind === "repo" ? s.card.title : undefined;
      const tool = s.tool?.trim() || undefined;
      return {
        headline: s.headline,
        fullName,
        tool,
        url: fullName ? `https://github.com/${fullName}` : toolUrlFor(tool) ?? undefined,
        description: s.card?.subtitle ?? s.body,
        stats: s.card?.stats,
        body: s.body,
      };
    });
}

function systemPrompt(): string {
  return [
    `You write long-form blog posts for our site, expanding on short-form content posted at ${BRAND_IDENTITY.handle}.`,
    `You are given a list of items (usually GitHub repos, sometimes AI tools) with GROUNDING FACTS: a name/link and, when available, real stats and a description. NEVER invent numbers, links, or claims beyond what's given. If a fact isn't provided, write around it instead of guessing.`,
    // Note: this prompt is deliberately written WITHOUT em dashes. The model mirrors
    // the punctuation it is shown, and em dashes are banned in this brand's copy.
    `PUNCTUATION RULE, NON-NEGOTIABLE: never use an em dash (—) or an en dash (–). Not in the title, headings, or body. Use commas, colons, or periods instead. Em dashes read as AI-written and are banned in this brand's copy.`,
    `Voice: a working engineer explaining what's actually interesting here. Write like a person talking, not like marketing. Use contractions. Short, direct sentences. Technical enough to be credible, no hype-filler ("game-changer", "revolutionary", "state-of-the-art"). Confident and opinionated is good; fabricated specifics are not.`,
    `For EACH item, write a dedicated section: what it does, why it's notable/trending right now, a concrete technical detail or standout feature, and who should actually use it. 2-4 short paragraphs. If a repoFullName is given, that section's "url" MUST be exactly https://github.com/<repoFullName> — never a different link.`,
    `Write an intro (1-2 paragraphs) that sets up the theme connecting all the items, and a conclusion (1 paragraph) that ties it together and mentions readers can catch the fast version on ${BRAND_IDENTITY.handle}.`,
    `Respond with ONLY a JSON object, no markdown, of the shape:`,
    `{"title":"...","dek":"...","intro":"...","sections":[{"heading":"...","repoFullName":"owner/repo","url":"https://github.com/owner/repo","body":"..."}],"conclusion":"..."}`,
  ].join("\n");
}

function userPrompt(spec: CarouselSpec, items: RepoItem[]): string {
  const lines = [`Topic: ${spec.topic ?? spec.caption}`, `Carousel caption: ${spec.caption}`, ``, `Items (grounding facts — do not exceed these):`];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.fullName ?? it.headline}`);
    if (it.description) lines.push(`   description: ${it.description}`);
    if (it.stats?.length) lines.push(`   stats: ${it.stats.map((s) => `${s.label}=${s.value}`).join(", ")}`);
    if (it.body && it.body !== it.description) lines.push(`   note: ${it.body}`);
  });
  lines.push(``, `Write the full article now.`);
  return lines.join("\n");
}

interface RawLongform {
  title?: string;
  dek?: string;
  intro?: string;
  sections?: Array<{ heading?: string; repoFullName?: string; url?: string; body?: string }>;
  conclusion?: string;
}

function parseJsonObject(text: string): RawLongform {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model response");
  return JSON.parse(fenced.slice(start, end + 1)) as RawLongform;
}

/** Coerce the model's reply into a valid LongformArticle, enforcing repo URLs stay grounded. */
function normalizeLongform(raw: RawLongform, spec: CarouselSpec, items: RepoItem[]): LongformArticle {
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: LongformSection[] = rawSections
    .map((s, i) => {
      const grounded = items[i];
      const fullName = grounded?.fullName;
      const modelHeading = typeof s.heading === "string" && s.heading.trim() ? s.heading.trim() : grounded?.headline ?? `Item ${i + 1}`;
      // The model sometimes mis-names the org in its own heading (e.g. writes
      // "mendableai/firecrawl" when the real repo is "firecrawl/firecrawl") even
      // though the URL is forced grounded below. Keep the heading's *descriptor*
      // but force the repo name prefix to the grounded fullName too. Accept either
      // separator the model might emit, then re-join with a colon (never a dash).
      const sep = [" — ", ": "].find((d) => modelHeading.includes(d));
      const descriptor = fullName && sep ? modelHeading.slice(modelHeading.indexOf(sep) + sep.length) : modelHeading;
      return {
        heading: fullName ? `${fullName}: ${descriptor}` : modelHeading,
        repoFullName: fullName,
        // Force the URL to the grounded link when we have one (repo → GitHub,
        // tool → its mapped site) — never trust the model's own URL there.
        url: grounded?.url ?? (typeof s.url === "string" ? s.url.trim() : undefined),
        body: typeof s.body === "string" && s.body.trim() ? s.body.trim() : grounded?.description ?? grounded?.body ?? "",
      };
    })
    .filter((s) => s.body.length > 0);

  return scrub({
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : spec.topic ?? spec.caption,
    dek: typeof raw.dek === "string" && raw.dek.trim() ? raw.dek.trim() : spec.caption,
    intro: typeof raw.intro === "string" && raw.intro.trim() ? raw.intro.trim() : spec.caption,
    sections: sections.length ? sections : items.map((it, i) => ({ heading: it.fullName ?? it.headline, repoFullName: it.fullName, url: it.url, body: it.description ?? it.body ?? `Item ${i + 1}` })),
    conclusion:
      typeof raw.conclusion === "string" && raw.conclusion.trim()
        ? raw.conclusion.trim()
        : `Follow ${BRAND_IDENTITY.handle} for the fast version of this and more AI/dev content.`,
  });
}

/**
 * The last gate before an article ships. The prompt forbids em dashes, but a model
 * is not a guarantee, and some of this text isn't ours anyway (fetched GitHub
 * descriptions land in `body`). Strip them here so it is impossible to publish one.
 */
function scrub(a: LongformArticle): LongformArticle {
  return {
    ...a,
    title: noEmDash(a.title),
    dek: noEmDash(a.dek),
    intro: noEmDash(a.intro),
    sections: a.sections.map((s) => ({ ...s, heading: noEmDash(s.heading), body: noEmDash(s.body) })),
    conclusion: noEmDash(a.conclusion),
  };
}

/** Deterministic fallback (no LLM key). Expands the carousel's own copy without inventing anything. */
function stubLongform(spec: CarouselSpec, items: RepoItem[]): LongformArticle {
  return scrub({
    title: spec.topic ?? spec.caption,
    dek: spec.caption,
    intro: spec.caption,
    sections: items.map((it, i) => ({
      heading: it.fullName ?? it.headline,
      repoFullName: it.fullName,
      url: it.url,
      body: [it.description, it.stats?.length ? it.stats.map((s) => `${s.label}: ${s.value}`).join(" · ") : null].filter(Boolean).join("\n\n") || `Item ${i + 1}`,
    })),
    conclusion: `Follow ${BRAND_IDENTITY.handle} for the fast version of this and more AI/dev content.`,
  });
}

type LlmProvider = "openrouter" | "anthropic";

function pickProvider(): LlmProvider | null {
  if (env.openrouterApiKey()) return "openrouter";
  if (env.anthropicApiKey()) return "anthropic";
  return null;
}

async function callLlm(provider: LlmProvider, system: string, user: string, fetchImpl: typeof fetch): Promise<string> {
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
        max_tokens: 4000,
        system: `${system}\n\nRespond with ONLY the JSON object — no prose, no code fences.`,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`longform Anthropic ${res.status}`);
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    // Current Claude models run adaptive thinking by default, so content[0] may
    // be a thinking block — pick the text block, wherever it sits.
    return json.content?.find((b) => b.type === "text")?.text ?? "";
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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`longform LLM ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function generateLongformArticle(spec: CarouselSpec, opts: { fetchImpl?: typeof fetch } = {}): Promise<LongformArticle> {
  const items = itemsFromSpec(spec);
  const provider = pickProvider();
  if (!provider) return stubLongform(spec, items);

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const content = await callLlm(provider, systemPrompt(), userPrompt(spec, items), fetchImpl);
    return normalizeLongform(parseJsonObject(content), spec, items);
  } catch (err) {
    console.warn(`[longform] generation failed, using stub: ${err instanceof Error ? err.message : err}`);
    return stubLongform(spec, items);
  }
}
