import type { BrandSurface, ContentStatus } from "@cmd/contracts";

/**
 * Moderation policy — the automated half of the Phase-1 "safe core" gate.
 *
 * The human gate (approval) is already enforced by the state machine. This adds
 * the attribution rule: untagged links count as organic, so paid content must
 * carry UTM attribution or it can't be measured. The tool auto-tags paid links
 * and refuses to publish anything it can't tag. So for items marked paid, every
 * link must carry UTM attribution; we auto-tag what we can and BLOCK what we
 * can't (unparseable links). Organic content is left alone.
 *
 * Pure and deterministic: takes a payload, returns a (possibly auto-tagged) copy
 * plus any blocking violations. No DB, no network — trivially testable.
 */

export type JsonRecord = Record<string, unknown>;

export interface ModerationViolation {
  code: "unparseable_url" | "missing_required_field";
  message: string;
}

export interface ModerationResult {
  ok: boolean;
  violations: ModerationViolation[];
  /** The payload to persist — auto-tagged when paid, untouched otherwise. */
  payload: JsonRecord;
  /** URLs that were auto-tagged (for logging/audit). */
  taggedUrls: string[];
}

export interface ModerationContext {
  brandSurface: BrandSurface;
  /** The state we're moving to — moderation only runs on approve/publish. */
  to: ContentStatus;
}

const MODERATED_TARGETS: readonly ContentStatus[] = ["approved", "published"];
const REQUIRED_UTM = ["utm_source", "utm_medium", "utm_campaign"] as const;
// Matches http(s) URLs; trailing sentence punctuation is trimmed before parsing.
const URL_RE = /https?:\/\/[^\s)<>"']+/g;

/**
 * Evaluate (and auto-tag) an item's payload for a transition.
 *
 * A payload is treated as PAID when `payload.paid === true`. Paid links get
 * `utm_source=<brand>`, `utm_medium=paid_social`, `utm_campaign=<payload.campaign
 * or "content_engine">` added for any missing UTM key. Existing UTM values are
 * never overwritten. Scanned surfaces: the `content` string and a `links` array.
 */
export function evaluateModeration(
  payload: JsonRecord,
  ctx: ModerationContext,
): ModerationResult {
  if (!MODERATED_TARGETS.includes(ctx.to) || payload.paid !== true) {
    return { ok: true, violations: [], payload, taggedUrls: [] };
  }

  const violations: ModerationViolation[] = [];
  const taggedUrls: string[] = [];
  const params: Record<string, string> = {
    utm_source: ctx.brandSurface,
    utm_medium: "paid_social",
    utm_campaign:
      typeof payload.campaign === "string" && payload.campaign.trim()
        ? payload.campaign.trim()
        : "content_engine",
  };

  const tag = (raw: string): string => {
    const trailing = raw.match(/[.,;:!?]+$/)?.[0] ?? "";
    const clean = trailing ? raw.slice(0, -trailing.length) : raw;
    let url: URL;
    try {
      url = new URL(clean);
    } catch {
      violations.push({
        code: "unparseable_url",
        message: `Cannot auto-tag paid link (unparseable): ${raw}`,
      });
      return raw;
    }
    let changed = false;
    for (const key of REQUIRED_UTM) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, params[key]!);
        changed = true;
      }
    }
    if (changed) taggedUrls.push(url.toString());
    return url.toString() + trailing;
  };

  const next: JsonRecord = { ...payload };

  if (typeof next.content === "string") {
    next.content = next.content.replace(URL_RE, (m) => tag(m));
  }
  if (Array.isArray(next.links)) {
    next.links = next.links.map((l) => (typeof l === "string" ? tag(l) : l));
  }

  return { ok: violations.length === 0, violations, payload: next, taggedUrls };
}

export class ModerationError extends Error {
  readonly violations: ModerationViolation[];
  constructor(violations: ModerationViolation[]) {
    super(`Content blocked by moderation: ${violations.map((v) => v.message).join("; ")}`);
    this.name = "ModerationError";
    this.violations = violations;
  }
}
