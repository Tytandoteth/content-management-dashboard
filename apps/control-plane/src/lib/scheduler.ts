import { PostizClient } from "@cmd/integrations";
import { prisma, type ContentItem } from "@cmd/db";
import { env } from "./env.js";
import { recordTransition } from "./content-service.js";
import { publishItem } from "./publish-service.js";

/**
 * The scheduler — drives approved content out to Postiz on time.
 *
 * Runs as a Railway cron (every minute). For each `approved` item whose publish
 * time is due, it walks approved → scheduled → published through the SAME
 * recordTransition gate (so moderation + audit + events all apply), publishing
 * via the single Postiz chokepoint in between. Idempotent: only `approved`,
 * due items are picked up, so re-running is safe.
 */

export interface TickResult {
  due: number;
  published: number;
  errors: number;
  skipped?: "postiz_not_configured" | "auto_publish_off";
  failures: Array<{ id: string; error: string }>;
}

/**
 * Is an approved item due to publish at `now`? Due when it has no scheduled time
 * (publish immediately on approval) or its scheduled time has arrived. Pure, so
 * the selection rule is unit-testable independent of the DB query that mirrors it.
 */
export function isDue(
  item: Pick<ContentItem, "status" | "scheduledAt">,
  now: Date,
): boolean {
  if (item.status !== "approved") return false;
  return item.scheduledAt === null || item.scheduledAt.getTime() <= now.getTime();
}

export async function tick(now: Date = new Date()): Promise<TickResult> {
  const apiUrl = env.postizApiUrl();
  const apiKey = env.postizApiKey();
  if (!apiUrl || !apiKey) {
    const due = await prisma.contentItem.count({
      where: { status: "approved", OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    });
    return { due, published: 0, errors: 0, skipped: "postiz_not_configured", failures: [] };
  }
  // Safety: the cron only auto-publishes to live channels when AUTO_PUBLISH is on.
  // Manual "Publish now" (an explicit human action) is unaffected.
  if (!env.autoPublish()) {
    const due = await prisma.contentItem.count({
      where: { status: "approved", OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    });
    return { due, published: 0, errors: 0, skipped: "auto_publish_off", failures: [] };
  }

  const client = new PostizClient({ baseUrl: apiUrl, apiKey });

  const dueItems = await prisma.contentItem.findMany({
    where: { status: "approved", OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    orderBy: { scheduledAt: "asc" },
    take: 25,
  });

  let published = 0;
  let errors = 0;
  const failures: TickResult["failures"] = [];

  for (const item of dueItems) {
    try {
      // approved → scheduled (records the intended publish time)
      await recordTransition({
        contentItemId: item.id,
        to: "scheduled",
        actor: "scheduler",
        scheduledAt: item.scheduledAt ?? now,
      });

      const { postizPostId, platforms } = await publishItem(
        {
          id: item.id,
          title: item.title,
          type: item.type,
          payload: (item.payload ?? {}) as Record<string, unknown>,
          assetUrls: item.assetUrls,
          scheduledAt: item.scheduledAt,
          brandSurface: item.brandSurface,
        },
        client,
      );

      // scheduled → published (emits content.published with the Postiz id)
      await recordTransition({
        contentItemId: item.id,
        to: "published",
        actor: "scheduler",
        postizPostId,
        platforms,
      });
      published += 1;
    } catch (err) {
      errors += 1;
      failures.push({ id: item.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { due: dueItems.length, published, errors, failures };
}
