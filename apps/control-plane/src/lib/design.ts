/**
 * Shared design constants + helpers (ported from the Claude Design handoff).
 * Plain TS so both server and client components can import it.
 */
import type { ContentStatus } from "@cmd/contracts";

export interface LifecycleStage {
  id: ContentStatus;
  label: string;
  color: string; // CSS var
  bg: string;
  glyph: string; // Icon name
}

export const LIFECYCLE: LifecycleStage[] = [
  { id: "idea", label: "Idea", color: "var(--st-idea)", bg: "var(--st-idea-bg)", glyph: "lightbulb" },
  { id: "draft", label: "Draft", color: "var(--st-draft)", bg: "var(--st-draft-bg)", glyph: "pencil" },
  { id: "in_review", label: "In review", color: "var(--st-review)", bg: "var(--st-review-bg)", glyph: "eye" },
  { id: "approved", label: "Approved", color: "var(--st-approved)", bg: "var(--st-approved-bg)", glyph: "check" },
  { id: "scheduled", label: "Scheduled", color: "var(--st-scheduled)", bg: "var(--st-scheduled-bg)", glyph: "clock" },
  { id: "published", label: "Published", color: "var(--st-published)", bg: "var(--st-published-bg)", glyph: "send" },
  { id: "measured", label: "Measured", color: "var(--st-measured)", bg: "var(--st-measured-bg)", glyph: "activity" },
];

export const STATUS_MAP: Record<string, LifecycleStage> = Object.fromEntries(
  [
    ...LIFECYCLE,
    { id: "rejected", label: "Rejected", color: "var(--st-rejected)", bg: "var(--st-rejected-bg)", glyph: "x" } as LifecycleStage,
  ].map((s) => [s.id, s]),
);

export const CONTENT_TYPE_GLYPH: Record<string, { label: string; glyph: string }> = {
  tweet: { label: "Tweet", glyph: "tweet" },
  thread: { label: "Thread", glyph: "thread" },
  clip: { label: "Clip", glyph: "clip" },
  carousel: { label: "Carousel", glyph: "carousel" },
  video: { label: "Video", glyph: "video" },
  post: { label: "Post", glyph: "post" },
};

export const BRANDS: Record<string, { label: string; color: string; dim: string; border: string }> = {
  default: { label: "Default", color: "var(--teal)", dim: "var(--teal-dim)", border: "var(--line-teal)" },
};

/** numbers-are-heroes formatting */
export function abbrev(n: number, opts: { money?: boolean; plus?: boolean } = {}): string {
  const { money = false, plus = false } = opts;
  const sign = n < 0 ? "-" : plus && n > 0 ? "+" : "";
  const a = Math.abs(n);
  let out: string;
  if (a >= 1e12) out = (a / 1e12).toFixed(a % 1e12 === 0 ? 0 : 1) + "T";
  else if (a >= 1e9) out = (a / 1e9).toFixed(a % 1e9 < 1e8 ? 0 : 1) + "B";
  else if (a >= 1e6) out = (a / 1e6).toFixed(a < 1e7 ? 1 : a % 1e6 === 0 ? 0 : 1) + "M";
  else if (a >= 1e3) out = (a / 1e3).toFixed(a < 1e4 ? 1 : 0) + "k";
  else out = a % 1 === 0 ? String(a) : a.toFixed(1);
  return (money ? sign + "$" : sign) + out;
}
