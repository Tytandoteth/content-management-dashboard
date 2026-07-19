"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TRANSITIONS,
  canTransition,
  REASON_REQUIRED_TARGETS,
  CONTENT_TYPES,
  BRAND_SURFACES,
  DEFAULT_BRAND_SURFACE,
  type ContentStatus,
} from "@cmd/contracts";
import { LIFECYCLE, STATUS_MAP, CONTENT_TYPE_GLYPH } from "@/lib/design";
import { Icon } from "./Icon";
import { BrandBadge } from "./ui";

interface Item {
  id: string;
  title: string;
  type: string;
  brandSurface: string;
  status: string;
  assetUrls?: unknown;
  updatedAt?: string;
}

/** Board columns, in pipeline order, plus the rejected lane. */
const COLUMNS: ContentStatus[] = [
  "idea",
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "measured",
  "rejected",
];

/** The next forward state a card advances to via the quick button (never the
 * rejected branch — that's a deliberate drag/decision, not a one-click). */
function forwardTarget(status: string): ContentStatus | null {
  const outs = (TRANSITIONS[status as ContentStatus] ?? []).filter((s) => s !== "rejected");
  return outs[0] ?? null;
}

export function ContentBoard({ initialBrand = "" }: { initialBrand?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState(initialBrand);
  const [drag, setDrag] = useState<{ id: string; from: ContentStatus } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Quick-add idea form.
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState("video");
  const [draftBrand, setDraftBrand] = useState(initialBrand || DEFAULT_BRAND_SURFACE);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (brand) sp.set("brandSurface", brand);
    const res = await fetch(`/api/content?${sp.toString()}`);
    const d = await res.json().catch(() => ({ items: [] }));
    setItems(d.items ?? []);
    setLoading(false);
  }, [brand]);
  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  };

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const c of COLUMNS) g[c] = [];
    for (const it of items) (g[it.status] ??= []).push(it);
    return g;
  }, [items]);

  const move = useCallback(
    async (id: string, from: ContentStatus, to: ContentStatus) => {
      if (from === to) return;
      if (!canTransition(from, to)) {
        flash(`Can't move ${STATUS_MAP[from]?.label ?? from} → ${STATUS_MAP[to]?.label ?? to}`);
        return;
      }
      let reason: string | null = null;
      if (REASON_REQUIRED_TARGETS.includes(to)) {
        reason = window.prompt(`Reason for moving to ${STATUS_MAP[to]?.label ?? to}?`)?.trim() || null;
        if (!reason) return; // cancelled — the state machine requires a reason
      }
      setBusy((b) => new Set(b).add(id));
      // Optimistic.
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: to } : it)));
      try {
        const res = await fetch(`/api/content/${id}/transition`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to, actor: "board", reason }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: from } : it))); // revert
          flash(err.error ?? `Move failed (${res.status})`);
        } else {
          const d = await res.json();
          if (d.item) setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...d.item } : it)));
          if (d.staged) flash(`Approved · staged ${d.staged.slideCount} slides to ready-to-post`);
        }
      } catch {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: from } : it)));
        flash("Network error — move reverted");
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(id);
          return n;
        });
      }
    },
    [],
  );

  const addIdea = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: draftType, title, brandSurface: draftBrand, status: "idea", createdBy: "board" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.item) {
        setItems((prev) => [d.item, ...prev]);
        setDraftTitle("");
      } else {
        flash(d.error ?? "Could not add idea");
      }
    } finally {
      setAdding(false);
    }
  }, [draftTitle, draftType, draftBrand]);

  const legalTargets = drag ? new Set(TRANSITIONS[drag.from] ?? []) : new Set<ContentStatus>();

  const sel: React.CSSProperties = {
    background: "var(--ink-900)",
    color: "var(--fg)",
    border: "1px solid var(--line-strong)",
    borderRadius: "var(--r-md)",
    padding: "7px 10px",
    fontSize: "var(--t-sm)",
    fontFamily: "var(--font-body)",
  };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Content board</h1>
          <p className="mono" style={{ margin: "4px 0 0", fontSize: "var(--t-sm)", color: "var(--muted)" }}>
            Capture ideas → drag through the pipeline. Each move is an audited state transition.
          </p>
        </div>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={sel}>
          <option value="">All brands</option>
          {BRAND_SURFACES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Quick-add idea */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16, background: "var(--ink-800)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: 10 }}>
        <span style={{ color: "var(--st-idea)", display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", fontWeight: 600 }}>
          <Icon name="lightbulb" size={15} /> New idea
        </span>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addIdea()}
          placeholder="e.g. Sonnet 5 dropped and X is in shambles"
          style={{ ...sel, flex: 1, minWidth: 220 }}
        />
        <select value={draftType} onChange={(e) => setDraftType(e.target.value)} style={sel}>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)} style={sel}>
          {BRAND_SURFACES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <button
          onClick={addIdea}
          disabled={adding || !draftTitle.trim()}
          style={{ ...sel, cursor: draftTitle.trim() ? "pointer" : "not-allowed", background: "var(--st-idea-bg)", color: "var(--st-idea)", border: "1px solid var(--st-idea)", fontWeight: 600, opacity: draftTitle.trim() ? 1 : 0.5, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="plus" size={14} /> Add
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>Loading board…</div>
      ) : (
        <div className="scroll-y" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
          {COLUMNS.map((col) => {
            const stage = STATUS_MAP[col];
            const cards = grouped[col] ?? [];
            const isLegalDrop = !!drag && legalTargets.has(col);
            const isOver = over === col && isLegalDrop;
            return (
              <div
                key={col}
                onDragOver={(e) => {
                  if (isLegalDrop) {
                    e.preventDefault();
                    setOver(col);
                  }
                }}
                onDragLeave={() => setOver((o) => (o === col ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  if (drag && isLegalDrop) move(drag.id, drag.from, col);
                  setDrag(null);
                }}
                style={{
                  minWidth: 252,
                  width: 252,
                  flexShrink: 0,
                  background: isOver ? stage?.bg : "var(--ink-900)",
                  border: `1px solid ${isOver ? stage?.color : drag && isLegalDrop ? "var(--line-strong)" : "var(--line)"}`,
                  borderRadius: "var(--r-lg)",
                  padding: 8,
                  transition: "background 120ms, border-color 120ms",
                  opacity: drag && !isLegalDrop && drag.from !== col ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px 10px" }}>
                  <span style={{ color: stage?.color, display: "flex" }}><Icon name={stage?.glyph ?? "list"} size={14} /></span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--fg)" }}>{stage?.label ?? col}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", background: "var(--ink-700)", borderRadius: 99, padding: "1px 7px" }}>{cards.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
                  {cards.map((it) => {
                    const tg = CONTENT_TYPE_GLYPH[it.type] ?? { label: it.type, glyph: "post" };
                    const fwd = forwardTarget(it.status);
                    const isBusy = busy.has(it.id);
                    return (
                      <div
                        key={it.id}
                        draggable={!isBusy}
                        onDragStart={() => setDrag({ id: it.id, from: it.status as ContentStatus })}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        style={{
                          background: "var(--ink-800)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--r-md)",
                          padding: 10,
                          cursor: isBusy ? "wait" : "grab",
                          opacity: isBusy ? 0.6 : 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "var(--muted)", display: "flex" }}><Icon name={tg.glyph} size={13} /></span>
                          <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>{tg.label}</span>
                          <span style={{ marginLeft: "auto" }}><BrandBadge brand={it.brandSurface} size="sm" /></span>
                        </div>
                        <Link href={`/content/${it.id}`} style={{ textDecoration: "none", color: "var(--fg)", fontFamily: "var(--font-body)", fontSize: "var(--t-sm)", fontWeight: 500, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {it.title}
                        </Link>
                        {fwd && (
                          <button
                            onClick={() => move(it.id, it.status as ContentStatus, fwd)}
                            disabled={isBusy}
                            title={`Advance to ${STATUS_MAP[fwd]?.label ?? fwd}`}
                            style={{ alignSelf: "flex-start", background: "transparent", border: "1px solid var(--line-strong)", color: stage?.color, borderRadius: "var(--r-sm)", padding: "3px 8px", fontSize: 11, fontFamily: "var(--font-body)", cursor: isBusy ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            {STATUS_MAP[fwd]?.label ?? fwd} <Icon name="send" size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div style={{ color: "var(--muted)", fontSize: 11, textAlign: "center", padding: "14px 0", border: "1px dashed var(--line)", borderRadius: "var(--r-md)" }}>
                      {drag && isLegalDrop ? "Drop here" : "—"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "var(--ink-700)", border: "1px solid var(--line-strong)", color: "var(--fg)", borderRadius: "var(--r-md)", padding: "10px 16px", fontSize: "var(--t-sm)", boxShadow: "0 8px 30px rgba(0,0,0,0.4)", zIndex: 50 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
