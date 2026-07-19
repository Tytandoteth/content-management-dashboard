import { PostizClient } from "@cmd/integrations";
import { prisma, type ContentItem } from "@cmd/db";
import { env } from "./env.js";
import { recordTransition } from "./content-service.js";

/**
 * The Analytics service — closes the loop (roadmap §2: `published → measured`).
 *
 * For published items it records performance metrics (pulled from Postiz when
 * configured, or ingested manually), writes `Metric` rows, and advances the item
 * to `measured` through the same `recordTransition` gate. "measured closes the
 * loop" — so we can ask which generated content actually drove signups.
 */

export interface RecordMetricsInput {
  contentItemId: string;
  platform?: string;
  metrics: Record<string, number>;
  source?: "postiz" | "app_analytics" | "manual";
}

/** Write one Metric row per key. Returns the number written. */
export async function recordMetrics(input: RecordMetricsInput): Promise<number> {
  const platform = input.platform ?? "aggregate";
  const capturedAt = new Date();
  const rows = Object.entries(input.metrics).filter(([, v]) => Number.isFinite(v));
  if (rows.length === 0) return 0;
  await prisma.metric.createMany({
    data: rows.map(([key, value]) => ({ contentItemId: input.contentItemId, platform, key, value })),
    skipDuplicates: true,
  });
  // touch capturedAt uniqueness is handled by the unique index; ignore dup races.
  void capturedAt;
  return rows.length;
}

export interface AnalyticsTickResult {
  considered: number;
  measured: number;
  metricsWritten: number;
  postiz: boolean;
}

/**
 * Cron-style pass: for every `published` item, pull/refresh metrics and advance
 * it to `measured`. Idempotent — only `published` items are picked up, and
 * `measured` is terminal.
 */
export async function analyticsTick(now: Date = new Date()): Promise<AnalyticsTickResult> {
  const apiUrl = env.postizApiUrl();
  const apiKey = env.postizApiKey();
  const client = apiUrl && apiKey ? new PostizClient({ baseUrl: apiUrl, apiKey }) : null;

  const published = await prisma.contentItem.findMany({ where: { status: "published" }, take: 50 });

  let metricsWritten = 0;
  let measured = 0;

  for (const item of published) {
    let metrics: Record<string, number> = {};
    if (client && item.postizPostId) {
      metrics = await client.getPostMetrics(item.postizPostId).catch(() => ({}));
    }
    if (Object.keys(metrics).length > 0) {
      metricsWritten += await recordMetrics({ contentItemId: item.id, metrics, source: "postiz" });
    }
    // Advance to measured whether metrics came from Postiz now or were ingested
    // manually earlier — the loop should close even without a live Postiz.
    try {
      await recordTransition({ contentItemId: item.id, to: "measured", actor: "analytics" });
      measured += 1;
    } catch {
      /* leave as published if the transition is somehow illegal */
    }
  }

  void now;
  return { considered: published.length, measured, metricsWritten, postiz: Boolean(client) };
}

/** Measure a single item on demand (used by publish-now / manual flows). */
export async function measureItem(item: Pick<ContentItem, "id">): Promise<void> {
  await recordTransition({ contentItemId: item.id, to: "measured", actor: "analytics" });
}
