import { BRAND_IDENTITY, BRAND_VOICE } from "@cmd/brand";
import { prisma, type ContentItem } from "@cmd/db";
import { specFromItem, resourcesFromSpec, slugify } from "./article.js";
import { callLLM } from "./llm.js";
import { env } from "./env.js";

/**
 * Draft a helpful, on-brand reply to a comment on a published video. The reply
 * addresses the comment and points the commenter to that post's resource article
 * (the free guide with every tool + clickable links). Human-reviewed before send.
 */

/** Public URL of the resource article for a content item. */
export function articleUrl(item: Pick<ContentItem, "title">): string {
  return `${env.resourceBaseUrl()}/r/${slugify(item.title)}`;
}

/**
 * A short comment to PIN on the post — the highest-leverage free move: it answers
 * "where do I get this?" for every viewer at once. Deterministic (no LLM, instant).
 */
export function pinnedComment(url: string, toolCount: number): string {
  const tools = toolCount > 0 ? `all ${toolCount} tool${toolCount === 1 ? "" : "s"} + the links` : "all the links";
  return `📌 Everything from this post — ${tools} — is in the free guide here: ${url} (save it!)`;
}

export interface ReplyContext {
  topic: string;
  tools: Array<{ name: string; url: string | null; payoff?: string }>;
  url: string;
}

/** Gather what a reply can draw on: the video's topic, its tools, and its article. */
export async function buildReplyContext(item: ContentItem): Promise<ReplyContext | null> {
  const spec = specFromItem(item);
  if (!spec) return null;
  const resources = resourcesFromSpec(spec);

  // Enrich with catalog payoffs when the item recorded the tools it featured.
  const toolIds = Array.isArray((item.payload as Record<string, unknown>)?.toolIds)
    ? ((item.payload as Record<string, unknown>).toolIds as string[])
    : [];
  const payoffByName = new Map<string, string>();
  if (toolIds.length) {
    const rows = await prisma.aiTool.findMany({ where: { id: { in: toolIds } } });
    for (const t of rows) payoffByName.set(t.name.toLowerCase(), t.payoff);
  }

  return {
    topic: spec.topic ?? item.title,
    tools: resources.map((r) => ({ name: r.name, url: r.url, payoff: payoffByName.get(r.name.toLowerCase()) })),
    url: articleUrl(item),
  };
}

export interface DraftReplyInput {
  item: ContentItem;
  comment: string;
  commenter?: string;
}

const SYSTEM = [
  `You write replies to comments on ${BRAND_IDENTITY.handle}, a short-form account about AI tools that help people ${BRAND_VOICE.outcomes.join(", ")}.`,
  "Rules for the reply:",
  "- 1–2 short sentences, warm and genuinely helpful. Sound like a real creator, not a bot.",
  "- Directly address what the commenter said. If they asked a question, answer it briefly using the video's tools.",
  "- ALWAYS point them to the free full guide at the article URL provided (it has every tool + clickable links).",
  "- No hashtags. At most one tasteful emoji. Don't be salesy. Never invent tools or links not provided.",
  "Respond with ONLY the reply text — no quotes, no preamble.",
].join("\n");

/** Deterministic fallback so the flow works with no LLM key. */
function stubReply(ctx: ReplyContext): string {
  return `Glad this one landed! I put every tool + the links in the free guide here: ${ctx.url}`;
}

export async function draftReply(input: DraftReplyInput): Promise<{ reply: string; context: ReplyContext } | null> {
  const ctx = await buildReplyContext(input.item);
  if (!ctx) return null;

  const toolLines = ctx.tools.length
    ? ctx.tools.map((t) => `- ${t.name}${t.url ? ` (${t.url})` : ""}${t.payoff ? ` — ${t.payoff}` : ""}`).join("\n")
    : "(no specific tools tagged)";
  const user = [
    `Video topic: ${ctx.topic}`,
    `Tools featured:\n${toolLines}`,
    `Article URL (always include this): ${ctx.url}`,
    input.commenter ? `Commenter: ${input.commenter}` : "",
    `Comment: "${input.comment}"`,
    "Write the reply now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply: string;
  try {
    const out = await callLLM(SYSTEM, user, { maxTokens: 300 });
    reply = (out ?? stubReply(ctx)).replace(/^["'\s]+|["'\s]+$/g, "");
    // Safety net: if the model dropped the link, append it.
    if (!reply.includes(ctx.url)) reply = `${reply} ${ctx.url}`.trim();
  } catch {
    reply = stubReply(ctx);
  }
  return { reply, context: ctx };
}
