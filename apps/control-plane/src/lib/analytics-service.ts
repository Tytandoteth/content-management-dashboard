import { PostizClient } from "@cmd/integrations";
import { prisma } from "@cmd/db";
import { env } from "./env.js";
import { recordTransition, ContentNotFoundError } from "./content-service.js";

/**
 * The Analytics service — closes the loop (roadmap §2: `published → measured`).
 *
 * For published items it records performance metrics (pulled from Postiz when
 * configured, or ingested manually), writes `Metric` rows, and advances the item
 * to `measured` through the same `recordTransition` gate. "measured closes the
 * loop" — so we can ask which generated content actually drove signups.
 *
 * Two rules this file exists to enforce:
 *
 *  1. `capturedAt` is truncated to the HOUR. The `Metric` unique index is
 *     `(contentItemId, platform, key, capturedAt)`, so a `new Date()` per write
 *     made every row unique to the millisecond and the dedup never fired —
 *     re-running the tick duplicated the same numbers forever. On the hour, a
 *     re-tick inside the same hour is a no-op and later hours build a real time
 *     series.
 *  2. Only items whose metrics were actually WRITTEN this tick advance to
 *     `measured`. `measured` is terminal; advancing an item with zero data
 *     retires it permanently and its real numbers can never be attached.
 */

export type MetricSource = "postiz" | "app_analytics" | "manual";

/** A metric key longer than this is a bug or an injection, not a metric. */
export const MAX_METRIC_KEY_LENGTH = 64;
/** More keys than this in one call means someone is dumping a blob at us. */
export const MAX_METRIC_KEYS = 20;
/** A trillion. Above this the number is a timestamp, an id, or a mistake. */
export const MAX_METRIC_VALUE = 1e12;

/** Statuses a metric may be attached to. Anything else is out of order. */
export const METRIC_ELIGIBLE_STATUSES = ["published", "measured"] as const;

/** Bad numbers/keys in the payload → HTTP 400. */
export class MetricValidationError extends Error {
  readonly code = "invalid_metrics";
  constructor(message: string) {
    super(message);
    this.name = "MetricValidationError";
  }
}

/** Item is not in a state that can carry metrics → HTTP 409. */
export class MetricStateError extends Error {
  readonly code = "invalid_state";
  constructor(readonly status: string) {
    super(`cannot record metrics on a ${status} item: publish it first`);
    this.name = "MetricStateError";
  }
}

export interface RecordMetricsInput {
  contentItemId: string;
  platform?: string;
  metrics: Record<string, number>;
  source?: MetricSource;
  /** Capture time; truncated to the hour before it is written. Defaults to now. */
  capturedAt?: Date;
  /**
   * Status the caller already read in this pass (the tick). Skips a redundant
   * lookup; omit it and the item is fetched and checked.
   */
  knownStatus?: string;
}

/** Top of the hour (UTC) for `d` — the granularity every Metric row is keyed at. */
export function truncateToHour(d: Date): Date {
  const t = new Date(d.getTime());
  t.setUTCMinutes(0, 0, 0);
  return t;
}

/**
 * Throws unless every key/value is a sane metric. Used by both entry points:
 * the manual ingest route and `recordMetrics` itself, so nothing reaches the
 * table unvalidated.
 */
export function assertValidMetrics(metrics: Record<string, unknown>): void {
  const entries = Object.entries(metrics);
  if (entries.length === 0) {
    throw new MetricValidationError("metrics must contain at least one key");
  }
  if (entries.length > MAX_METRIC_KEYS) {
    throw new MetricValidationError(`too many metric keys (max ${MAX_METRIC_KEYS})`);
  }
  for (const [key, value] of entries) {
    if (!key.trim()) {
      throw new MetricValidationError("metric keys must be non-empty");
    }
    if (key.length > MAX_METRIC_KEY_LENGTH) {
      throw new MetricValidationError(
        `metric key "${key.slice(0, 20)}…" exceeds ${MAX_METRIC_KEY_LENGTH} characters`,
      );
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new MetricValidationError(`metric "${key}" must be a finite number`);
    }
    if (value < 0) {
      throw new MetricValidationError(`metric "${key}" must be >= 0`);
    }
    if (value > MAX_METRIC_VALUE) {
      throw new MetricValidationError(`metric "${key}" exceeds the maximum of ${MAX_METRIC_VALUE}`);
    }
  }
}

/**
 * Drop anything a third party sent that we would refuse, and cap the key count.
 * Used on the Postiz path only: a weird upstream payload should cost us the bad
 * keys, not the whole tick. Returns the survivors plus what was dropped so the
 * caller can log it.
 */
export function sanitizeMetrics(metrics: Record<string, unknown>): {
  clean: Record<string, number>;
  dropped: string[];
} {
  const clean: Record<string, number> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (Object.keys(clean).length >= MAX_METRIC_KEYS) {
      dropped.push(key);
      continue;
    }
    const ok =
      key.trim().length > 0 &&
      key.length <= MAX_METRIC_KEY_LENGTH &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_METRIC_VALUE;
    if (ok) clean[key] = value as number;
    else dropped.push(key);
  }
  return { clean, dropped };
}

/**
 * Write one Metric row per key at the top of the capture hour. Returns the
 * number of rows the database actually inserted — with `skipDuplicates`, a
 * second call in the same hour writes nothing and correctly reports 0.
 */
export async function recordMetrics(input: RecordMetricsInput): Promise<number> {
  assertValidMetrics(input.metrics);

  const status = input.knownStatus ?? (await readItemStatus(input.contentItemId));
  if (!(METRIC_ELIGIBLE_STATUSES as readonly string[]).includes(status)) {
    throw new MetricStateError(status);
  }

  const platform = input.platform ?? "aggregate";
  const source = input.source ?? "postiz";
  const capturedAt = truncateToHour(input.capturedAt ?? new Date());

  const result = await prisma.metric.createMany({
    data: Object.entries(input.metrics).map(([key, value]) => ({
      contentItemId: input.contentItemId,
      platform,
      key,
      value,
      source,
      capturedAt,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function readItemStatus(contentItemId: string): Promise<string> {
  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    select: { status: true },
  });
  if (!item) throw new ContentNotFoundError(contentItemId);
  return item.status;
}

export interface AnalyticsTickResult {
  considered: number;
  measured: number;
  metricsWritten: number;
  /** Items left `published` because this tick found no metrics for them. */
  skippedNoMetrics: number;
  /** Postiz calls that failed (auth, timeout, instance down) — not "no data". */
  fetchErrors: number;
  /** Items whose metrics landed but whose `measured` transition was rejected. */
  transitionErrors: number;
  postiz: boolean;
}

/**
 * Cron-style pass: for every `published` item, pull metrics and — only if some
 * were written — advance it to `measured`. Idempotent: `measured` is terminal so
 * an item is picked up once, and same-hour re-runs dedup at the unique index.
 *
 * Oldest-touched items go first, so a backlog larger than the page size drains
 * instead of the same 50 rows being re-read every run.
 */
export async function analyticsTick(now: Date = new Date()): Promise<AnalyticsTickResult> {
  const apiUrl = env.postizApiUrl();
  const apiKey = env.postizApiKey();
  const client = apiUrl && apiKey ? new PostizClient({ baseUrl: apiUrl, apiKey }) : null;

  const published = await prisma.contentItem.findMany({
    where: { status: "published" },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const capturedAt = truncateToHour(now);
  let metricsWritten = 0;
  let measured = 0;
  let skippedNoMetrics = 0;
  let fetchErrors = 0;
  let transitionErrors = 0;

  for (const item of published) {
    let metrics: Record<string, number> = {};

    if (client && item.postizPostId) {
      const pulled = await client
        .getPostMetrics(item.postizPostId)
        .catch((err: unknown) => ({
          metrics: {} as Record<string, number>,
          error: err instanceof Error ? err.message : String(err),
        }));
      if (pulled.error) {
        fetchErrors += 1;
        console.warn(`[analytics] metrics fetch failed for ${item.id}: ${pulled.error}`);
      }
      const { clean, dropped } = sanitizeMetrics(pulled.metrics);
      if (dropped.length > 0) {
        console.warn(`[analytics] dropped invalid metric keys for ${item.id}: ${dropped.join(", ")}`);
      }
      metrics = clean;
    }

    let written = 0;
    if (Object.keys(metrics).length > 0) {
      try {
        written = await recordMetrics({
          contentItemId: item.id,
          metrics,
          source: "postiz",
          capturedAt,
          knownStatus: item.status,
        });
        metricsWritten += written;
      } catch (err) {
        console.warn(
          `[analytics] metric write failed for ${item.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // `measured` is TERMINAL. Advancing an item we have no numbers for retires it
    // with an empty record and no way back, which is exactly what a keyless
    // install used to do to every published item on its first cron run.
    if (written === 0) {
      skippedNoMetrics += 1;
      continue;
    }

    try {
      await recordTransition({ contentItemId: item.id, to: "measured", actor: "analytics" });
      measured += 1;
    } catch (err) {
      transitionErrors += 1;
      console.warn(
        `[analytics] measured transition failed for ${item.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return {
    considered: published.length,
    measured,
    metricsWritten,
    skippedNoMetrics,
    fetchErrors,
    transitionErrors,
    postiz: Boolean(client),
  };
}
