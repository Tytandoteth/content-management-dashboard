"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEFAULT_BRAND_SURFACE } from "@cmd/contracts";
import { Icon } from "./Icon";
import { Btn, StatusPill, BrandBadge, PaidTag, UtmTag, EmptyState } from "./ui";
import { AssetPreview } from "./AssetPreview";
import { CONTENT_TYPE_GLYPH, BRANDS } from "@/lib/design";

export interface InboxItem {
  id: string;
  title: string;
  type: string;
  brandSurface: string;
  createdBy: string;
  paid?: boolean;
  utm?: boolean;
  assetUrls?: unknown;
}

export function ApprovalInbox({ items, bulk = false }: { items: InboxItem[]; bulk?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (items.length === 0) {
    return <EmptyState icon="check" title="Inbox zero" hint="Every queued piece has been reviewed. The engine surfaces the next batch here." />;
  }
  async function approveAll() {
    setBusy(true);
    try {
      for (const it of items) {
        await fetch(`/api/content/${it.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: "approved", actor: "dashboard" }) }).catch(() => {});
      }
      router.refresh();
    } finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {bulk && items.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
          <Btn kind="ghost" size="sm" icon="check" disabled={busy} onClick={approveAll}>Approve all clear</Btn>
        </div>
      )}
      {items.map((item, i) => <Row key={item.id} item={item} index={i} />)}
    </div>
  );
}

function Row({ item, index }: { item: InboxItem; index: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hover, setHover] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function transition(to: "approved" | "rejected", body?: Record<string, unknown>) {
    setError(null); setBusy(true);
    try {
      const res = await fetch(`/api/content/${item.id}/transition`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, actor: "dashboard", ...body }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ borderBottom: "1px solid var(--line)", background: hover ? "var(--ink-750)" : "transparent", transition: "background var(--dur-fast)" }}>
      <div style={{ display: "flex", gap: 12, padding: "13px 16px", alignItems: "flex-start" }}>
        <Link href={`/content/${item.id}`}><AssetPreview assetUrls={item.assetUrls} type={item.type} brand={item.brandSurface} size={64} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/content/${item.id}`} style={{ textDecoration: "none", display: "block", fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</Link>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--t-xs)", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--fg-dim)" }}>{CONTENT_TYPE_GLYPH[item.type]?.label ?? item.type}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <BrandBadge brand={item.brandSurface in BRANDS ? item.brandSurface : DEFAULT_BRAND_SURFACE} size="sm" />
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{item.createdBy}</span>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusPill status="in_review" size="sm" />
            {item.paid !== undefined && <PaidTag paid={!!item.paid} />}
            {item.utm && <UtmTag />}
          </div>
          {error && <p style={{ marginTop: 8, fontSize: "var(--t-xs)", color: "var(--danger)" }}>{error}</p>}

          {rejecting ? (
            <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="label" style={{ color: "var(--st-rejected)" }}>Reason (required — trains the brand&apos;s taste)</div>
              <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. Off-brand — hook is weak, or the tool isn't named. Keep it practical and specific."
                style={{ width: "100%", resize: "vertical", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "9px 11px", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)", lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="danger" size="sm" icon="x" disabled={!reason.trim() || busy} onClick={() => transition("rejected", { reason })}>Confirm reject</Btn>
                <Btn kind="bare" size="sm" onClick={() => { setRejecting(false); setReason(""); }}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 11, display: "flex", gap: 8, alignItems: "center" }}>
              <Btn kind="primary" size="sm" icon="check" disabled={busy} onClick={() => transition("approved")}>Approve</Btn>
              <Btn kind="ghost" size="sm" icon="x" disabled={busy} onClick={() => setRejecting(true)}>Reject</Btn>
              <Link href={`/content/${item.id}`} style={{ marginLeft: "auto", fontSize: "var(--t-xs)", color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>Review <Icon name="arrowRight" size={13} /></Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
