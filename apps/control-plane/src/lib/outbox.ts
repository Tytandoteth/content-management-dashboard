import { isEventType, type DomainEvent } from "@cmd/contracts";
import { N8nDispatcher } from "@cmd/integrations";
import { prisma } from "@cmd/db";
import { env } from "./env.js";

const MAX_ATTEMPTS = 5;

export interface DrainResult {
  delivered: number;
  failed: number;
  deadLettered: number;
}

/**
 * Drain unprocessed OutboxEvents to n8n. Idempotent and safe to call from a cron
 * (every minute) or right after a transition. Each event is marked processed
 * only on successful delivery; failures increment `attempts` and are retried
 * until MAX_ATTEMPTS, after which they're left for inspection (dead-lettered).
 *
 * This is the bridge that makes the §1 contract real: state changes here become
 * events other services act on, with at-least-once delivery.
 */
export async function drainOutbox(limit = 50): Promise<DrainResult> {
  const base = env.n8nWebhookBase();
  if (!base) {
    return { delivered: 0, failed: 0, deadLettered: 0 };
  }

  const dispatcher = new N8nDispatcher({
    webhookBaseUrl: base,
    signingToken: env.controlPlaneApiToken(),
  });

  const pending = await prisma.outboxEvent.findMany({
    where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const row of pending) {
    if (!isEventType(row.type)) {
      // Unknown event type — never deliverable; park it.
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { attempts: MAX_ATTEMPTS, lastError: `unknown event type: ${row.type}` },
      });
      deadLettered += 1;
      continue;
    }

    const event = {
      id: row.id,
      type: row.type,
      contentItemId: row.contentItemId ?? "",
      payload: row.payload,
      occurredAt: row.createdAt.toISOString(),
    } as unknown as DomainEvent;

    try {
      await dispatcher.dispatch(event);
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { processedAt: new Date(), attempts: { increment: 1 } },
      });
      delivered += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      if (attempts >= MAX_ATTEMPTS) deadLettered += 1;
      else failed += 1;
    }
  }

  return { delivered, failed, deadLettered };
}
