"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CONTENT_STATUSES, CONTENT_TYPES, BRAND_SURFACES } from "@cmd/contracts";
import { Icon } from "./Icon";
import { AssetPreview } from "./AssetPreview";
import { NewCarousel } from "./NewCarousel";
import { StatusPill, BrandBadge } from "./ui";

interface Item { id: string; title: string; type: string; brandSurface: string; status: string; assetUrls?: unknown }

export function ContentLibrary({ initialStatus = "", initialType = "", initialBrand = "" }: { initialStatus?: string; initialType?: string; initialBrand?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [type, setType] = useState(initialType);
  const [brand, setBrand] = useState(initialBrand);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (type) sp.set("type", type);
    if (brand) sp.set("brandSurface", brand);
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/content?${sp.toString()}`);
    const d = await res.json().catch(() => ({ items: [] }));
    setItems(d.items ?? []);
    setLoading(false);
  }, [status, type, brand, q]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const sel: React.CSSProperties = { background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "6px 10px", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Content library</h1>
        <span className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>{items.length} items</span>
      </div>

      <NewCarousel onCreated={load} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
          <option value="">All statuses</option>
          {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={sel}>
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={sel}>
          <option value="">All brands</option>
          {BRAND_SURFACES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...sel, padding: "0 10px" }}>
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…" style={{ background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)", padding: "6px 0" }} />
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>No matching content.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {items.map((it) => {
            return (
              <Link key={it.id} href={`/content/${it.id}`} style={{ textDecoration: "none", background: "var(--ink-800)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: 10, paddingBottom: 0 }}>
                  <AssetPreview assetUrls={it.assetUrls} type={it.type} brand={it.brandSurface} variant="card" />
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-base)", fontWeight: 600, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: "auto" }}>
                    <StatusPill status={it.status} size="sm" />
                    <BrandBadge brand={it.brandSurface} size="sm" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
