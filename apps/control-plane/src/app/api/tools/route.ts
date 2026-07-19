import { NextResponse } from "next/server";
import { listTools, upsertTool, toolCategories } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** GET /api/tools — list the catalog. Query: category, search, orderBy=fresh|used|name */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const [tools, categories] = await Promise.all([
    listTools({
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      orderBy: (url.searchParams.get("orderBy") as "fresh" | "used" | "name" | null) ?? undefined,
    }),
    toolCategories(),
  ]);
  return NextResponse.json({ tools, categories, total: tools.length });
}

/** POST /api/tools — create or update a tool by name. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const required = ["name", "domain", "category", "oneLiner", "payoff"] as const;
  for (const f of required) {
    if (typeof body[f] !== "string" || !(body[f] as string).trim()) {
      return NextResponse.json({ error: `${f} is required` }, { status: 400 });
    }
  }
  const tool = await upsertTool({
    name: (body.name as string).trim(),
    domain: (body.domain as string).trim(),
    category: (body.category as string).trim(),
    oneLiner: (body.oneLiner as string).trim(),
    payoff: (body.payoff as string).trim(),
    pricing: typeof body.pricing === "string" ? body.pricing : undefined,
    url: typeof body.url === "string" ? body.url : undefined,
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
  });
  return NextResponse.json({ tool }, { status: 201 });
}
