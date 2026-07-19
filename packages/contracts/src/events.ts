import type { BrandSurface, ContentStatus, ContentType } from "./content-status.js";

/**
 * The shared event vocabulary (roadmap §1 — "the shared contract").
 *
 * Services stay decoupled as long as they all speak these events. No service
 * reaches into another's database; they pass messages through this contract.
 * The control plane emits these via a transactional outbox; n8n and future
 * services (e.g. Generation) consume them.
 */
export const EVENT_TYPES = [
  "content.created",
  "content.approved",
  "content.published",
  "metrics.updated",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return (
    typeof value === "string" &&
    (EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Common envelope every event shares. */
export interface EventEnvelope<T extends EventType, P> {
  /** Event id (the OutboxEvent row id). */
  id: string;
  type: T;
  /** The content item this event concerns. */
  contentItemId: string;
  payload: P;
  /** ISO-8601 timestamp the event was recorded. */
  occurredAt: string;
}

export interface ContentCreatedPayload {
  type: ContentType;
  brandSurface: BrandSurface;
  status: ContentStatus;
  createdBy: string;
}

export interface ContentApprovedPayload {
  approvedBy: string;
  /** When set, the scheduler should target this publish time. */
  scheduledAt?: string | null;
}

export interface ContentPublishedPayload {
  /** The Postiz post id the publish produced. */
  postizPostId: string;
  publishedAt: string;
  platforms: string[];
}

export interface MetricsUpdatedPayload {
  platform: string;
  /** Normalized metric key → value pairs (e.g. impressions, signups). */
  metrics: Record<string, number>;
  capturedAt: string;
}

export type ContentCreatedEvent = EventEnvelope<"content.created", ContentCreatedPayload>;
export type ContentApprovedEvent = EventEnvelope<"content.approved", ContentApprovedPayload>;
export type ContentPublishedEvent = EventEnvelope<"content.published", ContentPublishedPayload>;
export type MetricsUpdatedEvent = EventEnvelope<"metrics.updated", MetricsUpdatedPayload>;

export type DomainEvent =
  | ContentCreatedEvent
  | ContentApprovedEvent
  | ContentPublishedEvent
  | MetricsUpdatedEvent;

/**
 * Maps a status transition to the event it should emit, if any. Not every
 * transition is externally interesting — only the ones other services act on.
 */
export function eventTypeForTransition(to: ContentStatus): EventType | null {
  switch (to) {
    case "approved":
      return "content.approved";
    case "published":
      return "content.published";
    default:
      return null;
  }
}
