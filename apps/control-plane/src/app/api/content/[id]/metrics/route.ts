import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";
import { recordMetrics } from "@/lib/analytics-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/content/:id/metrics — manually ingest performance metrics for an item
 * (the analytics connector path when Postiz analytics isn't pulling). Body:
 * { metrics: { impressions: 1000, ... }, platform?, source? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const metrics = body.metrics;
  if (!metrics || typeof metrics !== "object") {
    return NextResponse.json({ error: "metrics (object of key→number) required" }, { status: 400 });
  }
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(metrics as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
  }

  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const written = await recordMetrics({
    contentItemId: id,
    metrics: clean,
    platform: typeof body.platform === "string" ? body.platform : undefined,
    source: body.source === "postiz" || body.source === "app_analytics" ? body.source : "manual",
  });
  return NextResponse.json({ written }, { status: 201 });
}
