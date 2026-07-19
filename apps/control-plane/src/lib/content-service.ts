import {
  assertTransition,
  eventTypeForTransition,
  DEFAULT_BRAND_SURFACE,
  type ContentStatus,
  type ContentType,
  type BrandSurface,
} from "@cmd/contracts";
import { prisma, type ContentItem, type Prisma } from "@cmd/db";
import {
  evaluateModeration,
  ModerationError,
  type JsonRecord,
} from "./moderation.js";

export interface CreateContentInput {
  type: ContentType;
  brandSurface?: BrandSurface;
  title: string;
  payload?: Prisma.InputJsonValue;
  assetUrls?: string[];
  createdBy: string;
  /** Starting status — `idea` or `draft`. Defaults to `draft`. */
  status?: Extract<ContentStatus, "idea" | "draft">;
}

/**
 * Create a content item and emit `content.created` in one transaction. The
 * outbox row is written with the item so the event fires iff the row committed.
 */
export async function createContent(input: CreateContentInput): Promise<ContentItem> {
  const status: ContentStatus = input.status ?? "draft";

  return prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.create({
      data: {
        type: input.type,
        brandSurface: input.brandSurface ?? DEFAULT_BRAND_SURFACE,
        title: input.title,
        payload: input.payload ?? {},
        assetUrls: input.assetUrls ?? [],
        status,
        createdBy: input.createdBy,
      },
    });

    await tx.outboxEvent.create({
      data: {
        type: "content.created",
        contentItemId: item.id,
        payload: {
          type: item.type,
          brandSurface: item.brandSurface,
          status: item.status,
          createdBy: item.createdBy,
        },
      },
    });

    return item;
  });
}

export interface TransitionInput {
  contentItemId: string;
  to: ContentStatus;
  actor: string;
  reason?: string | null;
  /** When transitioning to `scheduled`, the target publish time. */
  scheduledAt?: Date | null;
  /** When transitioning to `published`, the Postiz post id + platforms. */
  postizPostId?: string | null;
  platforms?: string[];
}

export class ContentNotFoundError extends Error {
  constructor(id: string) {
    super(`Content item ${id} not found`);
    this.name = "ContentNotFoundError";
  }
}

/**
 * The one true way content changes state.
 *
 * In a SINGLE transaction it: (1) validates the transition against the state
 * machine (illegal jumps and missing reasons throw), (2) updates the item's
 * status and the lifecycle timestamps/links for the target state, (3) appends an
 * immutable StateTransition audit row, and (4) enqueues the matching OutboxEvent
 * if the transition is externally interesting. Atomicity is the whole point:
 * status, audit, and event always agree, or none of them change.
 */
export async function recordTransition(input: TransitionInput): Promise<ContentItem> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.findUnique({
      where: { id: input.contentItemId },
    });
    if (!item) throw new ContentNotFoundError(input.contentItemId);

    const from = item.status as ContentStatus;
    // Throws IllegalTransitionError on an illegal edge or a missing reason.
    assertTransition(from, input.to, { reason: input.reason });

    const data: Prisma.ContentItemUpdateInput = { status: input.to };

    // Moderation gate: on approve/publish, auto-tag paid links with UTM
    // attribution and refuse anything unfixable. Throws ModerationError (→ 422).
    const moderation = evaluateModeration(item.payload as JsonRecord, {
      brandSurface: item.brandSurface as BrandSurface,
      to: input.to,
    });
    if (!moderation.ok) throw new ModerationError(moderation.violations);
    if (moderation.taggedUrls.length > 0) {
      data.payload = moderation.payload as Prisma.InputJsonValue;
    }
    switch (input.to) {
      case "rejected":
        data.rejectionReason = input.reason;
        break;
      case "scheduled":
        data.scheduledAt = input.scheduledAt ?? item.scheduledAt;
        break;
      case "published":
        data.publishedAt = new Date();
        if (input.postizPostId) data.postizPostId = input.postizPostId;
        break;
      case "measured":
        data.measuredAt = new Date();
        break;
      case "draft":
        // Re-entering draft from rejected clears the stale rejection reason.
        if (from === "rejected") data.rejectionReason = null;
        break;
    }

    const updated = await tx.contentItem.update({
      where: { id: item.id },
      data,
    });

    await tx.stateTransition.create({
      data: {
        contentItemId: item.id,
        fromStatus: from,
        toStatus: input.to,
        actor: input.actor,
        reason: input.reason ?? null,
      },
    });

    const eventType = eventTypeForTransition(input.to);
    if (eventType) {
      await tx.outboxEvent.create({
        data: {
          type: eventType,
          contentItemId: item.id,
          payload: buildEventPayload(eventType, updated, input),
        },
      });
    }

    return updated;
  });
}

function buildEventPayload(
  eventType: string,
  item: ContentItem,
  input: TransitionInput,
): Prisma.InputJsonValue {
  if (eventType === "content.approved") {
    return {
      approvedBy: input.actor,
      scheduledAt: (input.scheduledAt ?? item.scheduledAt)?.toISOString() ?? null,
    };
  }
  if (eventType === "content.published") {
    return {
      postizPostId: input.postizPostId ?? item.postizPostId ?? "",
      publishedAt: (item.publishedAt ?? new Date()).toISOString(),
      platforms: input.platforms ?? [],
    };
  }
  return {};
}
