import { NextResponse } from "next/server";
import {
  recordMetrics,
  MetricValidationError,
  MetricStateError,
  type MetricSource,
} from "@/lib/analytics-service";
import { ContentNotFoundError } from "@/lib/content-service";

export const dynamic = "force-dynamic";

const SOURCES: MetricSource[] = ["postiz", "app_analytics", "manual"];

/**
 * POST /api/content/:id/metrics — manually ingest performance metrics for an item
 * (the analytics connector path when Postiz analytics isn't pulling). Body:
 * { metrics: { impressions: 1000, ... }, platform?, source? }.
 *
 * Validation lives in `recordMetrics`, so the tick and this route enforce the
 * same rules; this handler only maps the failures to status codes. Notably it no
 * longer silently DROPS bad values: the old version filtered non-numbers out and
 * returned 201, so a typo'd payload reported success and wrote nothing.
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
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return NextResponse.json({ error: "metrics (object of key→number) required" }, { status: 400 });
  }

  const source = SOURCES.includes(body.source as MetricSource)
    ? (body.source as MetricSource)
    : "manual";

  try {
    const written = await recordMetrics({
      contentItemId: id,
      metrics: metrics as Record<string, number>,
      platform: typeof body.platform === "string" && body.platform.trim() ? body.platform : undefined,
      source,
    });
    return NextResponse.json({ written, source }, { status: 201 });
  } catch (err) {
    if (err instanceof MetricValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof MetricStateError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof ContentNotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw err;
  }
}
