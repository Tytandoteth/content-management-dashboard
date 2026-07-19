import { prisma } from "@cmd/db";
import type { AiTool } from "@cmd/db";

export type { AiTool };

export interface PickFreshOptions {
  category?: string;
  count?: number;
}

/**
 * Pull the freshest tools — least-used first, then least-recently-used (never-used
 * sort to the very front), with a light random tiebreak so equal-rank tools rotate.
 * This is what keeps every generated carousel featuring NEW tools.
 */
export async function pickFreshTools(options: PickFreshOptions = {}): Promise<AiTool[]> {
  const count = Math.max(1, Math.min(12, options.count ?? 5));
  // Over-fetch a candidate pool at the freshest rank, then shuffle within it.
  const pool = await prisma.aiTool.findMany({
    where: { active: true, ...(options.category ? { category: options.category } : {}) },
    orderBy: [{ useCount: "asc" }, { lastUsedAt: { sort: "asc", nulls: "first" } }],
    take: count * 3,
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  // Re-sort the shuffled pool by freshness and take the count we need.
  pool.sort(
    (a, b) =>
      a.useCount - b.useCount ||
      (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0),
  );
  return pool.slice(0, count);
}

/** Record that these tools were featured: bump useCount, stamp lastUsedAt. */
export async function markToolsUsed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.aiTool.updateMany({
    where: { id: { in: ids } },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}

export interface ListToolsOptions {
  category?: string;
  search?: string;
  orderBy?: "fresh" | "used" | "name";
}

export async function listTools(options: ListToolsOptions = {}): Promise<AiTool[]> {
  const orderBy =
    options.orderBy === "used"
      ? [{ useCount: "desc" as const }]
      : options.orderBy === "name"
        ? [{ name: "asc" as const }]
        : [{ useCount: "asc" as const }, { lastUsedAt: { sort: "asc" as const, nulls: "first" as const } }];
  return prisma.aiTool.findMany({
    where: {
      ...(options.category ? { category: options.category } : {}),
      ...(options.search
        ? { OR: [{ name: { contains: options.search, mode: "insensitive" } }, { oneLiner: { contains: options.search, mode: "insensitive" } }] }
        : {}),
    },
    orderBy,
  });
}

/** Distinct categories with how many tools each holds. */
export async function toolCategories(): Promise<Array<{ category: string; count: number }>> {
  const rows = await prisma.aiTool.groupBy({ by: ["category"], _count: { _all: true }, where: { active: true } });
  return rows.map((r) => ({ category: r.category, count: r._count._all })).sort((a, b) => a.category.localeCompare(b.category));
}

export interface ToolInput {
  name: string;
  domain: string;
  category: string;
  oneLiner: string;
  payoff: string;
  pricing?: string;
  url?: string;
  tags?: string[];
  active?: boolean;
}

/** Create or update a tool by name (idempotent for imports / the add-tool form). */
export async function upsertTool(input: ToolInput): Promise<AiTool> {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const data = {
    domain,
    url: input.url || `https://${domain}`,
    category: input.category.trim().toLowerCase(),
    oneLiner: input.oneLiner,
    payoff: input.payoff,
    pricing: input.pricing ?? "freemium",
    tags: input.tags ?? [],
    active: input.active ?? true,
  };
  return prisma.aiTool.upsert({ where: { name: input.name }, create: { name: input.name, ...data }, update: data });
}

/** Render a numbered brief block the composer can feature one-per-slide. */
export function toolsBrief(tools: AiTool[], angle: string): string {
  const lines = tools
    .map((t, i) => `${i + 1}. ${t.name} (${t.domain}) — ${t.oneLiner} Payoff: ${t.payoff}`)
    .join("\n");
  return [
    `${tools.length} AI tools that ${angle}`,
    "",
    `Feature EXACTLY these ${tools.length} tools, one per body slide, in this order. Use these exact names, and put their link domain on each slide:`,
    lines,
    "",
    `Open with a money/time stat on the cover. Keep count integrity: exactly ${tools.length} tool slides plus a hook and a CTA.`,
  ].join("\n");
}
