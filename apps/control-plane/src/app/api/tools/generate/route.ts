import { NextResponse } from "next/server";
import { DEFAULT_BRAND_SURFACE } from "@cmd/contracts";
import { prisma } from "@cmd/db";
import { pickFreshTools, markToolsUsed, toolsBrief } from "@/lib/tools";
import { runGeneration } from "@/lib/generation-service";
import { drainOutbox } from "@/lib/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_ANGLE = "make or save you money and time";

/**
 * POST /api/tools/generate — generate a carousel from the FRESHEST tools in the
 * catalog (so content is new each time). Picks least-used tools, composes a deck
 * that features exactly them, then marks them used and links their ids on the item.
 * Body: { category?, count?, angle? }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — use defaults */
  }

  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().toLowerCase() : undefined;
  const count = typeof body.count === "number" ? Math.max(3, Math.min(10, body.count)) : 5;
  const angle = typeof body.angle === "string" && body.angle.trim() ? body.angle.trim() : DEFAULT_ANGLE;

  const tools = await pickFreshTools({ category, count });
  if (tools.length === 0) {
    return NextResponse.json({ error: "no tools in catalog — seed it first", code: "empty_catalog" }, { status: 409 });
  }

  const prompt = toolsBrief(tools, angle);
  const outcome = await runGeneration({
    type: "carousel" as never,
    brandSurface: DEFAULT_BRAND_SURFACE as never,
    prompt,
    count: tools.length + 2,
  });

  // Mark the tools used; link their ids and set a clean title on each item
  // (the brief itself is long, so don't let it become the title).
  const toolIds = tools.map((t) => t.id);
  const cleanTitle = `${tools.length} AI tools that ${angle}`.slice(0, 120);
  await markToolsUsed(toolIds);
  for (const item of outcome.items) {
    await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        title: cleanTitle,
        payload: { ...((item.payload ?? {}) as Record<string, unknown>), toolIds } as never,
      },
    });
  }
  void drainOutbox().catch(() => {});

  return NextResponse.json(
    {
      count: outcome.items.length,
      items: outcome.items,
      tools: tools.map((t) => ({ id: t.id, name: t.name, domain: t.domain, useCount: t.useCount + 1 })),
    },
    { status: 201 },
  );
}
