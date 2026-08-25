import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Analytics is the one loop that ends in a TERMINAL state, so its bugs are
 * permanent: a row written with a millisecond timestamp can never dedup, and an
 * item advanced to `measured` with no data can never be measured again. These
 * tests pin both, plus the validation that keeps junk out of the Metric table.
 */

const createMany = vi.fn();
const findMany = vi.fn();
const findUnique = vi.fn();
const recordTransition = vi.fn();

vi.mock("@cmd/db", () => ({
  prisma: {
    metric: { createMany: (...a: unknown[]) => createMany(...a) },
    contentItem: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

class FakeNotFound extends Error {}
vi.mock("./content-service.js", () => ({
  recordTransition: (...a: unknown[]) => recordTransition(...a),
  ContentNotFoundError: FakeNotFound,
}));

const {
  recordMetrics,
  analyticsTick,
  truncateToHour,
  assertValidMetrics,
  sanitizeMetrics,
  MetricValidationError,
  MetricStateError,
  MAX_METRIC_KEYS,
  MAX_METRIC_KEY_LENGTH,
  MAX_METRIC_VALUE,
} = await import("./analytics-service.js");

const publishedItem = (over: Record<string, unknown> = {}) => ({
  id: "ci_1",
  status: "published",
  postizPostId: "post_1",
  ...over,
});

interface MetricRow {
  contentItemId: string;
  platform: string;
  key: string;
  value: number;
  source: string;
  capturedAt: Date;
}

/** The single argument prisma.metric.createMany was called with. */
function firstCreateManyArg(): { data: MetricRow[]; skipDuplicates: boolean } {
  return createMany.mock.calls[0]![0] as { data: MetricRow[]; skipDuplicates: boolean };
}

beforeEach(() => {
  createMany.mockReset().mockResolvedValue({ count: 1 });
  findMany.mockReset().mockResolvedValue([]);
  findUnique.mockReset().mockResolvedValue({ status: "published" });
  recordTransition.mockReset().mockResolvedValue({ id: "ci_1" });
  delete process.env.POSTIZ_API_URL;
  delete process.env.POSTIZ_API_KEY;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("metric validation", () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ["an empty payload", {}],
    ["a non-finite value", { impressions: Number.POSITIVE_INFINITY }],
    ["NaN", { impressions: Number.NaN }],
    ["a negative value", { impressions: -1 }],
    ["a value past the ceiling", { impressions: MAX_METRIC_VALUE + 1 }],
    ["a non-number value", { impressions: "1000" }],
    ["an empty key", { "": 1 }],
    ["a whitespace-only key", { "   ": 1 }],
    ["an over-long key", { ["k".repeat(MAX_METRIC_KEY_LENGTH + 1)]: 1 }],
    [
      "too many keys",
      Object.fromEntries(Array.from({ length: MAX_METRIC_KEYS + 1 }, (_, i) => [`k${i}`, i])),
    ],
  ];
  for (const [label, metrics] of bad) {
    it(`rejects ${label}`, () => {
      expect(() => assertValidMetrics(metrics)).toThrow(MetricValidationError);
    });
  }

  const good: Array<[string, Record<string, unknown>]> = [
    ["zero", { impressions: 0 }],
    ["the ceiling itself", { impressions: MAX_METRIC_VALUE }],
    ["a fractional rate", { engagement_rate: 0.0731 }],
    ["exactly the key limit", Object.fromEntries(Array.from({ length: MAX_METRIC_KEYS }, (_, i) => [`k${i}`, i]))],
    ["a key at the length limit", { ["k".repeat(MAX_METRIC_KEY_LENGTH)]: 1 }],
  ];
  for (const [label, metrics] of good) {
    it(`accepts ${label}`, () => {
      expect(() => assertValidMetrics(metrics)).not.toThrow();
    });
  }

  it("refuses to write metrics for an item that was never published", async () => {
    findUnique.mockResolvedValue({ status: "draft" });
    await expect(recordMetrics({ contentItemId: "ci_1", metrics: { likes: 3 } })).rejects.toBeInstanceOf(
      MetricStateError,
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it("allows metrics on a measured item — numbers keep arriving after the loop closes", async () => {
    findUnique.mockResolvedValue({ status: "measured" });
    await expect(recordMetrics({ contentItemId: "ci_1", metrics: { likes: 3 } })).resolves.toBe(1);
  });

  it("sanitizeMetrics drops the junk instead of throwing (the third-party path)", () => {
    const { clean, dropped } = sanitizeMetrics({ likes: 5, bogus: -2, huge: 1e13, "": 1, ok: 0 });
    expect(clean).toEqual({ likes: 5, ok: 0 });
    expect(dropped.sort()).toEqual(["", "bogus", "huge"]);
  });

  it("sanitizeMetrics caps the key count", () => {
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, i]));
    const { clean, dropped } = sanitizeMetrics(many);
    expect(Object.keys(clean)).toHaveLength(MAX_METRIC_KEYS);
    expect(dropped).toHaveLength(25 - MAX_METRIC_KEYS);
  });
});

describe("capturedAt truncation", () => {
  it("floors to the top of the UTC hour", () => {
    expect(truncateToHour(new Date("2026-08-25T14:37:52.913Z")).toISOString()).toBe(
      "2026-08-25T14:00:00.000Z",
    );
  });

  it("writes every row at the truncated hour, so a same-hour re-tick dedups", async () => {
    // The original bug: `new Date()` per call made (contentItemId, platform, key,
    // capturedAt) unique to the millisecond, so the @@unique index never matched
    // and each run appended a fresh copy of the same numbers.
    await recordMetrics({
      contentItemId: "ci_1",
      metrics: { impressions: 10, likes: 2 },
      capturedAt: new Date("2026-08-25T14:59:59.999Z"),
      knownStatus: "published",
    });
    const { data, skipDuplicates } = firstCreateManyArg();
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(2);
    for (const row of data) {
      expect(row.capturedAt.toISOString()).toBe("2026-08-25T14:00:00.000Z");
    }
  });

  it("persists platform and source on every row", async () => {
    await recordMetrics({
      contentItemId: "ci_1",
      metrics: { likes: 1 },
      platform: "tiktok",
      source: "manual",
      knownStatus: "published",
    });
    expect(firstCreateManyArg().data[0]!).toMatchObject({
      contentItemId: "ci_1",
      platform: "tiktok",
      key: "likes",
      value: 1,
      source: "manual",
    });
  });

  it("defaults platform to aggregate and source to postiz", async () => {
    await recordMetrics({ contentItemId: "ci_1", metrics: { likes: 1 }, knownStatus: "published" });
    expect(firstCreateManyArg().data[0]!).toMatchObject({ platform: "aggregate", source: "postiz" });
  });

  it("returns the row count the database actually inserted, not the key count", async () => {
    // Two keys offered, one already present for this hour → 1.
    createMany.mockResolvedValue({ count: 1 });
    const written = await recordMetrics({
      contentItemId: "ci_1",
      metrics: { impressions: 10, likes: 2 },
      knownStatus: "published",
    });
    expect(written).toBe(1);
  });
});

describe("analyticsTick", () => {
  it("reads the least-recently-touched published items first", async () => {
    await analyticsTick();
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      where: { status: "published" },
      orderBy: { updatedAt: "asc" },
    });
  });

  it("does NOT advance an item to measured when no metrics were written", async () => {
    // The keyless-install case: no Postiz configured, so nothing is pulled. The
    // old tick still transitioned, retiring the item into a terminal state with
    // an empty record — its real numbers could never be attached afterwards.
    findMany.mockResolvedValue([publishedItem()]);
    const res = await analyticsTick();
    expect(recordTransition).not.toHaveBeenCalled();
    expect(res).toMatchObject({ considered: 1, measured: 0, metricsWritten: 0, skippedNoMetrics: 1 });
  });

  it("counts a failed metrics fetch as a fetchError, not as silence", async () => {
    process.env.POSTIZ_API_URL = "https://post.example.com/api";
    process.env.POSTIZ_API_KEY = "key";
    findMany.mockResolvedValue([publishedItem()]);
    const { PostizClient } = await import("@cmd/integrations");
    vi.spyOn(PostizClient.prototype, "getPostMetrics").mockResolvedValue({
      metrics: {},
      error: "Postiz GET /statistics failed: 401",
    });

    const res = await analyticsTick();
    expect(res.fetchErrors).toBe(1);
    expect(res.measured).toBe(0);
    expect(res.skippedNoMetrics).toBe(1);
  });

  it("writes metrics and advances only the item it pulled numbers for", async () => {
    process.env.POSTIZ_API_URL = "https://post.example.com/api";
    process.env.POSTIZ_API_KEY = "key";
    findMany.mockResolvedValue([publishedItem({ id: "with_data" }), publishedItem({ id: "no_data", postizPostId: "post_2" })]);
    const { PostizClient } = await import("@cmd/integrations");
    vi.spyOn(PostizClient.prototype, "getPostMetrics").mockImplementation(
      async (postId: string): Promise<{ metrics: Record<string, number> }> =>
        postId === "post_1" ? { metrics: { impressions: 100 } } : { metrics: {} },
    );
    createMany.mockResolvedValue({ count: 1 });

    const res = await analyticsTick(new Date("2026-08-25T09:12:00.000Z"));

    expect(recordTransition).toHaveBeenCalledTimes(1);
    expect(recordTransition).toHaveBeenCalledWith({
      contentItemId: "with_data",
      to: "measured",
      actor: "analytics",
    });
    expect(res).toMatchObject({
      considered: 2,
      measured: 1,
      metricsWritten: 1,
      skippedNoMetrics: 1,
      fetchErrors: 0,
      transitionErrors: 0,
      postiz: true,
    });
    expect(firstCreateManyArg().data[0]!.capturedAt.toISOString()).toBe("2026-08-25T09:00:00.000Z");
  });

  it("counts and logs a rejected transition instead of swallowing it", async () => {
    process.env.POSTIZ_API_URL = "https://post.example.com/api";
    process.env.POSTIZ_API_KEY = "key";
    findMany.mockResolvedValue([publishedItem()]);
    const { PostizClient } = await import("@cmd/integrations");
    vi.spyOn(PostizClient.prototype, "getPostMetrics").mockResolvedValue({ metrics: { likes: 4 } });
    recordTransition.mockRejectedValue(new Error("illegal transition published → measured"));

    const res = await analyticsTick();

    expect(res).toMatchObject({ measured: 0, transitionErrors: 1, metricsWritten: 1 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("ci_1"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("illegal transition"));
  });

  it("reports postiz: false and skips every item when no client is configured", async () => {
    findMany.mockResolvedValue([publishedItem(), publishedItem({ id: "ci_2" })]);
    const res = await analyticsTick();
    expect(res).toMatchObject({ postiz: false, considered: 2, measured: 0, skippedNoMetrics: 2 });
  });
});
