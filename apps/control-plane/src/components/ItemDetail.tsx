"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BRAND_SURFACE } from "@cmd/contracts";
import { Icon } from "./Icon";
import { Pane, Btn, StatusPill, BrandBadge, PaidTag, UtmTag, ErrorState } from "./ui";
import { AssetPreview, imageAssets } from "./AssetPreview";
import { CarouselPreview } from "./CarouselPreview";
import { BRANDS, abbrev } from "@/lib/design";

interface Transition { id: string; fromStatus: string; toStatus: string; actor: string; reason: string | null; at: string }
interface Metric { id: string; platform: string; key: string; value: number; capturedAt: string }
interface Item {
  id: string; title: string; type: string; brandSurface: string; status: string; createdBy: string;
  payload: Record<string, unknown>; assetUrls: unknown; scheduledAt: string | null; postizPostId: string | null;
}

const EDITABLE = ["idea", "draft", "in_review", "approved", "scheduled"];

/** Public resource-article slug from the title (mirrors lib/article.ts slugify). */
function articleSlug(title: string): string {
  return title.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "post";
}

export function ItemDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ item: Item; transitions: Transition[]; metrics: Metric[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [schedule, setSchedule] = useState("");
  const [metricsText, setMetricsText] = useState('{ "impressions": 50000, "signups": 200 }');
  const [moderation, setModeration] = useState<string[] | null>(null);
  const [confirmingRepublish, setConfirmingRepublish] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/content/${id}`);
    if (!res.ok) { setErr(`Failed to load (${res.status})`); return; }
    const d = await res.json();
    setData(d);
    if (d.item?.scheduledAt) setSchedule(new Date(d.item.scheduledAt).toISOString().slice(0, 16));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <ErrorState title={err} />;
  if (!data) return <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>Loading…</div>;

  const { item, transitions, metrics } = data;
  const payload = item.payload ?? {};
  const paid = payload.paid === true;
  const content = typeof payload.content === "string" ? payload.content : "";
  const accent = "var(--teal)";

  async function act(path: string, body?: unknown, method = "POST") {
    setBusy(true); setErr(null); setModeration(null);
    try {
      const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.code === "moderation_blocked" && Array.isArray(d.violations)) setModeration(d.violations.map((v: { message: string }) => v.message));
        else setErr(d.error ?? `Failed (${res.status})`);
        return false;
      }
      await load();
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  const transition = (to: string, extra?: Record<string, unknown>) => act(`/api/content/${id}/transition`, { to, actor: "dashboard", ...extra });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => router.back()} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "var(--muted)", fontSize: "var(--t-sm)", cursor: "pointer", width: "fit-content" }}>
        <Icon name="chevronLeft" size={15} /> Back
      </button>

      <Pane pad={false} accent={accent}>
        <div style={{ display: "flex", gap: 16, padding: 18, flexWrap: "wrap" }}>
          {item.type === "carousel" && imageAssets(item.assetUrls).length > 1 ? (
            <CarouselPreview images={imageAssets(item.assetUrls)} />
          ) : (
            <AssetPreview assetUrls={item.assetUrls} type={item.type} brand={item.brandSurface} variant="full" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{item.title}</h1>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusPill status={item.status} size="sm" />
              <BrandBadge brand={item.brandSurface in BRANDS ? item.brandSurface : DEFAULT_BRAND_SURFACE} size="sm" />
              <PaidTag paid={paid} />
              {content.includes("utm_") && <UtmTag />}
              <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>by {item.createdBy}</span>
            </div>
            {content && <p style={{ marginTop: 12, fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{content}</p>}
            {item.type === "carousel" && imageAssets(item.assetUrls).length > 0 && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn kind="solid" size="sm" icon="link" onClick={() => navigator.clipboard?.writeText(content)}>Copy caption</Btn>
                <a href={`/api/content/${item.id}/download`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--line-strong)", fontSize: "var(--t-sm)", color: "var(--fg)", textDecoration: "none" }}>
                  <Icon name="arrowRight" size={14} /> Download .zip
                </a>
                <a href={`/r/${articleSlug(item.title)}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--line-teal)", fontSize: "var(--t-sm)", color: "var(--teal)", textDecoration: "none" }}>
                  <Icon name="link" size={14} /> Resource article
                </a>
                <Btn kind="bare" size="sm" onClick={() => navigator.clipboard?.writeText(`${location.origin}/r/${articleSlug(item.title)}`)}>Copy article link</Btn>
              </div>
            )}
            {item.postizPostId && <div className="mono" style={{ marginTop: 8, fontSize: "var(--t-xs)", color: "var(--muted)" }}>postiz: {item.postizPostId}</div>}
            {typeof payload.releaseUrl === "string" && (
              <a href={payload.releaseUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", color: "var(--teal)", textDecoration: "none" }}>
                View live post <Icon name="arrowUpRight" size={14} />
              </a>
            )}
          </div>
        </div>
      </Pane>

      {moderation && <ErrorState title="Moderation blocked — fix before this can ship" icon="ban" reasons={moderation} />}
      {err && <ErrorState title={err} />}

      {/* status-appropriate actions */}
      {(item.status === "idea" || item.status === "draft") && (
        <Pane label="Funnel" title="Move into review">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {item.status === "idea" ? (
              <Btn kind="primary" size="sm" icon="arrowRight" disabled={busy} onClick={() => transition("draft")}>Promote to draft</Btn>
            ) : (
              <Btn kind="primary" size="sm" icon="eye" disabled={busy} onClick={() => transition("in_review")}>Send to review</Btn>
            )}
            <span style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>Adds this to the approval inbox for sign-off.</span>
          </div>
        </Pane>
      )}

      {item.status === "in_review" && (
        <Pane label="Review" title="Approve or reject">
          {rejecting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="label" style={{ color: "var(--st-rejected)" }}>Reason (required — trains the brand&apos;s taste)</div>
              <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "9px 11px", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="danger" size="sm" icon="x" disabled={!reason.trim() || busy} onClick={async () => { if (await transition("rejected", { reason })) setRejecting(false); }}>Confirm reject</Btn>
                <Btn kind="bare" size="sm" onClick={() => setRejecting(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="primary" size="sm" icon="check" disabled={busy} onClick={() => transition("approved", schedule ? { scheduledAt: new Date(schedule).toISOString() } : undefined)}>Approve</Btn>
              <Btn kind="ghost" size="sm" icon="x" disabled={busy} onClick={() => setRejecting(true)}>Reject</Btn>
            </div>
          )}
        </Pane>
      )}

      {EDITABLE.includes(item.status) && (
        <Pane label="Schedule" title="Publish time">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} style={{ background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "7px 10px", fontSize: "var(--t-sm)", fontFamily: "var(--font-mono)" }} />
            <Btn kind="solid" size="sm" disabled={busy} onClick={() => act(`/api/content/${id}`, { scheduledAt: schedule ? new Date(schedule).toISOString() : null }, "PATCH")}>Save time</Btn>
            {(item.status === "approved" || item.status === "scheduled") && <Btn kind="primary" size="sm" icon="send" disabled={busy} onClick={() => act(`/api/content/${id}/publish-now`)}>Publish now</Btn>}
          </div>
        </Pane>
      )}

      {item.status === "published" && (
        <Pane label="Publish" title="Re-push to social">
          {confirmingRepublish ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.5 }}>
                Re-sends this to Postiz for its brand&apos;s channels. Channels that already delivered are skipped, so this won&apos;t duplicate a post that really went out — it only pushes what hasn&apos;t.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="primary" size="sm" icon="send" disabled={busy} onClick={async () => { if (await act(`/api/content/${id}/publish-now`, { republish: true })) setConfirmingRepublish(false); }}>Confirm republish</Btn>
                <Btn kind="bare" size="sm" onClick={() => setConfirmingRepublish(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn kind="ghost" size="sm" icon="send" disabled={busy} onClick={() => setConfirmingRepublish(true)}>Republish</Btn>
              <span style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>Re-push to Postiz if a post failed or needs redoing.</span>
              {typeof payload.publishError === "string" && payload.publishError && (
                <span style={{ width: "100%", fontSize: "var(--t-xs)", color: "var(--st-rejected, #ff6b6b)" }}>{payload.publishError}</span>
              )}
            </div>
          )}
        </Pane>
      )}

      {item.status === "published" && (
        <Pane label="Analytics" title="Record metrics (closes the measured loop)">
          <textarea value={metricsText} onChange={(e) => setMetricsText(e.target.value)} rows={2} className="mono" style={{ width: "100%", resize: "vertical", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "9px 11px", fontSize: "var(--t-sm)" }} />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Btn kind="solid" size="sm" icon="activity" disabled={busy} onClick={() => { let m; try { m = JSON.parse(metricsText); } catch { setErr("metrics must be valid JSON"); return; } act(`/api/content/${id}/metrics`, { metrics: m }); }}>Record metrics</Btn>
            <Btn kind="primary" size="sm" disabled={busy} onClick={() => act(`/api/analytics/tick`, undefined)} title="Pull metrics and advance to measured">Run analytics → measured</Btn>
          </div>
        </Pane>
      )}

      {/* metrics */}
      {metrics.length > 0 && (
        <Pane label="Measured" title="Performance">
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {metrics.slice(0, 8).map((m) => (
              <div key={m.id}>
                <div className="display tnum" style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--teal)" }}>{abbrev(m.value)}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.key}</div>
              </div>
            ))}
          </div>
        </Pane>
      )}

      {/* audit timeline */}
      <Pane label="Audit" title="Lifecycle timeline">
        {transitions.length === 0 ? (
          <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>No transitions yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
            {transitions.map((t) => (
              <li key={t.id} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
                <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--faint)", width: 130, flexShrink: 0 }}>{new Date(t.at).toLocaleString()}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)" }}>
                  <StatusPill status={t.fromStatus} size="sm" dot={false} />
                  <Icon name="arrowRight" size={12} />
                  <StatusPill status={t.toStatus} size="sm" dot={false} />
                </span>
                <span style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>by {t.actor}{t.reason ? ` · ${t.reason}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Pane>
    </div>
  );
}
