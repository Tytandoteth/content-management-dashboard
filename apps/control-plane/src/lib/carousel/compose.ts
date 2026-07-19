import {
  BRAND_IDENTITY,
  BRAND_VOICE,
  CAROUSEL_CANVAS,
} from "@cmd/brand";
import type { CarouselSpec, Slide, SlideRole } from "@cmd/carousel-render";
import { env } from "../env.js";

/**
 * The AI copywriter. Turns a plain-English topic into a fully-decided,
 * on-brand CarouselSpec (slide deck + caption + hashtags). Uses the OpenRouter
 * chat API (same wiring as the orchestrator); when no key is configured it
 * falls back to a deterministic stub so the whole pipeline — and the smoke
 * test — runs offline.
 */

export interface ComposeOptions {
  /** Target slide count (incl. hook + CTA). Clamped to the brand min/max. */
  slideCount?: number;
  fetchImpl?: typeof fetch;
}

function clampCount(n: number | undefined): number {
  const target = n && n > 0 ? n : env.carouselDefaultSlides();
  return Math.max(CAROUSEL_CANVAS.minSlides, Math.min(CAROUSEL_CANVAS.maxSlides, Math.round(target)));
}

/**
 * If the topic promises a count ("5 ways", "10 prompts", "7 AI tools", "5 things"),
 * return that number so we can force exactly that many body slides. Caps at 10
 * (so total stays within maxSlides). Null when no count is promised.
 */
const LIST_NOUNS =
  "things|ways|tools|prompts|tips|steps|tricks|hacks|ideas|apps|workflows|reasons|mistakes|secrets|features|skills|jobs|sites|websites|clips";
export function promisedItemCount(topic: string): number | null {
  const re = new RegExp(`\\b(\\d{1,2})\\b[^.]*?\\b(?:${LIST_NOUNS})\\b`, "i");
  const m = topic.match(re) ?? topic.match(/^\s*(\d{1,2})\b/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return n >= 2 && n <= 10 ? n : null;
}

function systemPrompt(slideCount: number, promised: number | null): string {
  return [
    `You write TikTok photo-carousel copy for ${BRAND_IDENTITY.handle}, an AI-tools creator account.`,
    `THE ANGLE OF EVERY POST is money or time: how this AI tool/workflow makes the viewer money, saves them money, or saves them time (${BRAND_VOICE.outcomes.join(", ")}). Whatever the topic, frame it through that lens — open with the payoff, not the tool.`,
    `Persona: ${BRAND_VOICE.persona}`,
    `Audience: ${BRAND_VOICE.audience}`,
    `Rules:`,
    ...BRAND_VOICE.rules.map((r) => `- ${r}`),
    ``,
    promised != null
      ? `COUNT (MANDATORY): this topic promises ${promised} items. Output EXACTLY ${promised + 2} slides — 1 hook + ${promised} body slides (one item each) + 1 CTA. Not ${promised + 1}, not ${promised + 3}. Exactly ${promised} distinct items. The hook's number must say ${promised}.`
      : `Aim for about ${slideCount} slides total — BUT count integrity wins (below).`,
    `COUNT INTEGRITY (critical): if the hook/topic promises a number of items — "5 ways", "7 tools", "10 prompts", "3 steps" — you MUST deliver EXACTLY that many body slides, one item each, plus the hook and the CTA. So "5 ways" = hook + 5 body + CTA = 7 slides. NEVER promise more items than you show. A viewer who is promised 5 and gets 3 feels cheated and bounces.`,
    `- Slide 1 has role "hook".`,
    `- The last slide has role "cta".`,
    `- Every slide in between has role "body" and teaches one concrete item/step/tip.`,
    `CTA slide: drive engagement, not just "link in bio". Tell them to (1) SAVE this so they don't lose it, (2) FOLLOW ${BRAND_IDENTITY.handle} for more money/time-saving AI, and (3) COMMENT a simple keyword (you choose one, e.g. "STACK" or "GUIDE") to get the full guide/resource sent to them. Do NOT put a raw URL in slide text. The keyword comment is what triggers the DM and drives comments.`,
    `Each slide: a short "kicker" (eyebrow, e.g. the tool name or "Step 2"), a punchy "headline" (<= 7 words), and a "body" (one or two concrete sentences; the CTA slide's body is optional). Keep text short — it must stay legible on a phone inside TikTok's safe area.`,
    `The hook slide (slide 1) is the THUMBNAIL. It has TWO parts that MUST read as ONE plain sentence:`,
    `  • "coverStat": the giant number/payoff, SHORT (≤ ~10 chars) — e.g. "$2,000/mo", "10 hrs/wk", "42 shorts", "$0".`,
    `  • "headline" (on the hook ONLY): the phrase that DIRECTLY COMPLETES that number and says what it IS. It is read immediately after the stat, so it must finish the sentence — NOT a separate slogan.`,
    `  Read them together out loud; a stranger must instantly get it. Good: coverStat "42 shorts" + headline "from one long video"; "10 hrs/wk" + "saved on meeting notes"; "$2,000/mo" + "in passive income from one AI workflow"; "$0" + "to build a real website". BAD (disconnected): "$2,000/mo" + "Updates that pay you back".`,
    `  No coverStat on other slides.`,
    `When a slide is about ONE specific tool/company, add a "tool" field with its plain name ("Opus Clips", "Fireflies", "ChatGPT", "Zapier", "Higgsfield", "Canva", etc.) so its logo can be shown as social proof. Omit "tool" if the slide isn't about a single named product.`,
    `Hashtags: 3 to 5 only. Mix broad (e.g. #aitools) with one or two specific to the tool/topic (e.g. #opusclips). Never more than 5.`,
    `Caption style: ${BRAND_VOICE.captionStyle}`,
    ``,
    `Respond with ONLY a JSON object, no markdown, of the shape:`,
    `{"slides":[{"role":"hook","kicker":"...","coverStat":"$500/mo","tool":"Opus Clips","headline":"...","body":"..."}],"caption":"...","hashtags":["#ai"]}`,
  ].join("\n");
}

interface RawSpec {
  slides?: Array<{ role?: string; kicker?: string; coverStat?: string; tool?: string; headline?: string; body?: string }>;
  caption?: string;
  hashtags?: unknown;
}

/** Coerce whatever the model returned into a valid, brand-correct CarouselSpec. */
export function normalizeSpec(raw: RawSpec, topic: string, slideCount: number): CarouselSpec {
  const rawSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const cleaned = rawSlides
    .map((s) => ({
      kicker: typeof s.kicker === "string" ? s.kicker.trim() : undefined,
      coverStat: typeof s.coverStat === "string" ? s.coverStat.trim().slice(0, 14) : undefined,
      tool: typeof s.tool === "string" ? s.tool.trim().slice(0, 40) : undefined,
      headline: typeof s.headline === "string" ? s.headline.trim() : "",
      body: typeof s.body === "string" ? s.body.trim() : undefined,
    }))
    .filter((s) => s.headline.length > 0)
    // Cap at the hard max (not the requested target) so a count-matched listicle
    // — e.g. hook + 5 items + CTA = 7 — isn't truncated back down.
    .slice(0, CAROUSEL_CANVAS.maxSlides);

  // Guarantee at least a hook + CTA even if the model under-delivered.
  if (cleaned.length === 0) {
    cleaned.push({ kicker: undefined, coverStat: undefined, tool: undefined, headline: topic, body: undefined });
  }

  const slides: Slide[] = cleaned.map((s, i) => {
    let role: SlideRole = "body";
    if (i === 0) role = "hook";
    else if (i === cleaned.length - 1) role = "cta";
    // coverStat only applies to the hook/thumbnail.
    return { role, kicker: s.kicker, headline: s.headline, body: s.body, tool: s.tool, ...(i === 0 ? { coverStat: s.coverStat } : {}) };
  });

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .filter((h): h is string => typeof h === "string")
        .map((h) => (h.startsWith("#") ? h : `#${h}`))
        // TikTok caps hashtags at ~5; 3–5 categorizes best. Hard-cap regardless
        // of what the model returns.
        .slice(0, 5)
    : [];

  // Strip any hashtags the model put in the caption — they're appended separately
  // from the hashtags array, so leaving them here would duplicate them.
  const rawCaption = typeof raw.caption === "string" && raw.caption.trim() ? raw.caption.trim() : topic;
  const caption = rawCaption.replace(/#[A-Za-z][\w]*/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();

  return {
    topic,
    slides,
    caption: caption || topic,
    hashtags: hashtags.length ? hashtags : [...BRAND_VOICE.hashtags],
  };
}

/**
 * Models occasionally emit unquoted hashtag tokens in arrays (e.g. `, #claude"`
 * or `, #ai,`), which is invalid JSON. Quote them so the deck parses instead of
 * falling back to the generic stub.
 */
function repairJson(s: string): string {
  return s
    .replace(/([[,]\s*)#([A-Za-z0-9_]+)"/g, '$1"#$2"')
    .replace(/([[,]\s*)#([A-Za-z0-9_]+)(\s*[,\]])/g, '$1"#$2"$3');
}

/** Strip ```json fences and parse the first JSON object, repairing if needed. */
function parseJsonObject(text: string): RawSpec {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model response");
  const slice = fenced.slice(start, end + 1);
  try {
    return JSON.parse(slice) as RawSpec;
  } catch {
    return JSON.parse(repairJson(slice)) as RawSpec;
  }
}

/** Deterministic fallback so dev/CI works with no LLM key. */
function stubSpec(topic: string, slideCount: number): CarouselSpec {
  const bodies = slideCount - 2 > 0 ? slideCount - 2 : 1;
  const slides: Slide[] = [
    { role: "hook", kicker: topic, headline: `The fastest way to use ${topic}`, body: "Most people do this the slow way. Here's the shortcut." },
  ];
  for (let i = 1; i <= bodies; i++) {
    slides.push({ role: "body", kicker: `Step ${i}`, headline: `Step ${i}`, body: `Concrete action ${i} for ${topic}.` });
  }
  slides.push({ role: "cta", headline: "Want the full guide?", body: "Follow and grab it from the link in my bio." });
  return { topic, slides, caption: `How to actually use ${topic}.`, hashtags: [...BRAND_VOICE.hashtags] };
}

type LlmProvider = "openrouter" | "anthropic";

/** Prefer OpenRouter if configured; otherwise use a direct Anthropic key. */
function pickProvider(): LlmProvider | null {
  if (env.openrouterApiKey()) return "openrouter";
  if (env.anthropicApiKey()) return "anthropic";
  return null;
}

/** One composer call → raw JSON-ish string. Supports OpenRouter and Anthropic. */
async function callComposer(
  provider: LlmProvider,
  system: string,
  user: string,
  fetchImpl: typeof fetch,
): Promise<string> {
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
        max_tokens: 3000,
        // Steer to JSON; parseJsonObject() extracts the object from the reply.
        system: `${system}\n\nRespond with ONLY the JSON object — no prose, no code fences.`,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`composer Anthropic ${res.status}`);
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
  if (!res.ok) throw new Error(`composer LLM ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function composeSpec(topic: string, options: ComposeOptions = {}): Promise<CarouselSpec> {
  // A number promised in the topic forces an exact body count (hook + N + CTA).
  const promised = promisedItemCount(topic);
  const slideCount =
    promised != null ? Math.min(CAROUSEL_CANVAS.maxSlides, promised + 2) : clampCount(options.slideCount);
  const provider = pickProvider();
  if (!provider) return stubSpec(topic, slideCount);

  const fetchImpl = options.fetchImpl ?? fetch;
  let lastErr: unknown;
  let lastSpec: CarouselSpec | undefined;
  // Retry once — a malformed response, a blip, OR a wrong item count shouldn't
  // ship (a count miss breaks the promise the hook makes).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const content = await callComposer(
        provider,
        systemPrompt(slideCount, promised),
        `Topic: ${topic}\nWrite the carousel now.`,
        fetchImpl,
      );
      const spec = normalizeSpec(parseJsonObject(content), topic, slideCount);
      lastSpec = spec;
      // Enforce the promised item count: retry once if the model under/over-delivered.
      if (promised != null) {
        const bodyCount = spec.slides.filter((s) => s.role === "body").length;
        if (bodyCount !== promised && attempt < 2) {
          throw new Error(`count mismatch: ${bodyCount} body slides, want ${promised}`);
        }
      }
      return spec;
    } catch (err) {
      lastErr = err;
    }
  }
  // A valid-but-imperfect deck beats the generic stub — keep the last good parse.
  if (lastSpec) return lastSpec;
  console.warn(`[carousel] composer LLM failed after retries, using stub spec: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
  return stubSpec(topic, slideCount);
}
