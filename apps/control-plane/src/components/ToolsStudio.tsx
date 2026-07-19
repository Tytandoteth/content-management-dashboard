"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { Pane, Btn, EmptyState, ErrorState } from "./ui";

interface Tool {
  id: string;
  name: string;
  domain: string;
  url: string | null;
  category: string;
  oneLiner: string;
  payoff: string;
  pricing: string;
  tags: string[];
  useCount: number;
  lastUsedAt: string | null;
  active: boolean;
}
interface CatCount {
  category: string;
  count: number;
}
type OrderBy = "fresh" | "used" | "name";

const PRICING_COLOR: Record<string, string> = {
  free: "var(--ok)",
  freemium: "var(--teal)",
  paid: "var(--warn)",
};

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (d < day) return "today";
  if (d < 7 * day) return `${Math.floor(d / day)}d ago`;
  return `${Math.floor(d / (7 * day))}w ago`;
}

export function ToolsStudio() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<CatCount[]>([]);
  const [category, setCategory] = useState<string>("");
  const [orderBy, setOrderBy] = useState<OrderBy>("fresh");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Generate-from-fresh-tools panel.
  const [genCategory, setGenCategory] = useState<string>("");
  const [genCount, setGenCount] = useState(5);
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState<{ id: string; tools: string[] } | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);

  // Add-tool form.
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", category: "", oneLiner: "", payoff: "", pricing: "freemium" });
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (search.trim()) qs.set("search", search.trim());
    qs.set("orderBy", orderBy);
    try {
      const res = await fetch(`/api/tools?${qs}`);
      const d = await res.json();
      setTools(d.tools ?? []);
      setCategories(d.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, [category, orderBy, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const total = useMemo(() => categories.reduce((s, c) => s + c.count, 0), [categories]);
  const fresh = useMemo(() => tools.filter((t) => t.useCount === 0).length, [tools]);

  const generate = async () => {
    if (genBusy) return;
    setGenBusy(true);
    setGenErr(null);
    setGenResult(null);
    try {
      const res = await fetch("/api/tools/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: genCount, ...(genCategory ? { category: genCategory } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setGenResult({ id: d.items?.[0]?.id, tools: (d.tools ?? []).map((t: { name: string }) => t.name) });
      await load();
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(false);
    }
  };

  const addTool = async () => {
    if (addBusy) return;
    setAddBusy(true);
    setAddErr(null);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setForm({ name: "", domain: "", category: "", oneLiner: "", payoff: "", pricing: "freemium" });
      setShowAdd(false);
      await load();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  };

  const inputStyle = {
    background: "var(--ink-900)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-md)",
    color: "var(--fg)",
    padding: "8px 11px",
    fontSize: "var(--t-base)",
    fontFamily: "var(--font-body)",
    outline: "none",
    width: "100%",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1080 }}>
      {/* GENERATE FROM FRESH TOOLS */}
      <Pane
        title="Generate from fresh tools"
        accent="var(--teal)"
        label="NEW EACH TIME"
        action={
          <Btn kind="primary" icon="sparkles" onClick={generate} disabled={genBusy}>
            {genBusy ? "Generating…" : "Generate carousel"}
          </Btn>
        }
      >
        <p style={{ color: "var(--fg-dim)", fontSize: "var(--t-sm)", margin: "0 0 14px" }}>
          Picks the least-used tools from your catalog and builds a money/time carousel featuring exactly them — then marks them used so the next one is different.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t-xs)", color: "var(--muted)" }}>
            CATEGORY
            <select value={genCategory} onChange={(e) => setGenCategory(e.target.value)} style={{ ...inputStyle, width: 200 }}>
              <option value="">Any (mix)</option>
              {categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({c.count})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t-xs)", color: "var(--muted)" }}>
            TOOLS / SLIDES
            <select value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} style={{ ...inputStyle, width: 110 }}>
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} tools
                </option>
              ))}
            </select>
          </label>
        </div>
        {genErr && <div style={{ marginTop: 14 }}><ErrorState title="Generation failed" reasons={[genErr]} /></div>}
        {genResult && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--teal-dim)", border: "1px solid var(--line-teal)", borderRadius: "var(--r-md)", fontSize: "var(--t-sm)" }}>
            <div style={{ color: "var(--fg)", fontWeight: 600, marginBottom: 4 }}>
              Draft created · featured {genResult.tools.join(", ")}
            </div>
            {genResult.id && (
              <Link href={`/content/${genResult.id}`} style={{ color: "var(--teal)", textDecoration: "none" }}>
                Open the draft →
              </Link>
            )}
          </div>
        )}
      </Pane>

      {/* CATALOG */}
      <Pane
        title="Tools catalog"
        label={`${total} TOOLS · ${fresh} FRESH`}
        action={
          <Btn kind="ghost" icon={showAdd ? "ban" : "plus"} size="sm" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancel" : "Add tool"}
          </Btn>
        }
      >
        {showAdd && (
          <div style={{ marginBottom: 16, padding: 14, background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input placeholder="Name (e.g. Notion)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Domain (e.g. notion.com)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} style={inputStyle} />
            <input placeholder="Category (e.g. productivity)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} />
            <select value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} style={inputStyle}>
              <option value="free">free</option>
              <option value="freemium">freemium</option>
              <option value="paid">paid</option>
            </select>
            <input placeholder="One-liner: what it does" value={form.oneLiner} onChange={(e) => setForm({ ...form, oneLiner: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            <input placeholder="Payoff: what it makes/saves you" value={form.payoff} onChange={(e) => setForm({ ...form, payoff: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            {addErr && <div style={{ gridColumn: "1 / -1" }}><ErrorState title="Could not save" reasons={[addErr]} /></div>}
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <Btn kind="primary" icon="check" onClick={addTool} disabled={addBusy}>
                {addBusy ? "Saving…" : "Save tool"}
              </Btn>
            </div>
          </div>
        )}

        {/* filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "6px 10px", flex: "1 1 220px" }}>
            <Icon name="search" size={14} />
            <input placeholder="Search tools…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontSize: "var(--t-sm)", width: "100%", fontFamily: "var(--font-body)" }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["fresh", "used", "name"] as OrderBy[]).map((o) => (
              <button key={o} onClick={() => setOrderBy(o)} style={{ padding: "6px 11px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: orderBy === o ? "var(--teal-dim)" : "transparent", color: orderBy === o ? "var(--teal)" : "var(--fg-dim)", fontSize: "var(--t-xs)", cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "capitalize" }}>
                {o}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={() => setCategory("")} style={chipStyle(category === "")}>
            all
          </button>
          {categories.map((c) => (
            <button key={c.category} onClick={() => setCategory(c.category)} style={chipStyle(category === c.category)}>
              {c.category} <span style={{ opacity: 0.6 }}>{c.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)", padding: 20 }}>Loading…</div>
        ) : tools.length === 0 ? (
          <EmptyState icon="bolt" title="No tools match" hint="Try a different filter, or add one." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {tools.map((t) => (
              <div key={t.id} style={{ background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 13 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--t-base)" }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: PRICING_COLOR[t.pricing] ?? "var(--muted)", border: `1px solid ${PRICING_COLOR[t.pricing] ?? "var(--line)"}`, borderRadius: "var(--r-full)", padding: "1px 7px" }}>{t.pricing}</span>
                  </div>
                  <span title={`used ${t.useCount}×, last ${relTime(t.lastUsedAt)}`} style={{ fontSize: 11, color: t.useCount === 0 ? "var(--ok)" : "var(--muted)", whiteSpace: "nowrap" }}>
                    {t.useCount === 0 ? "● fresh" : `${t.useCount}× · ${relTime(t.lastUsedAt)}`}
                  </span>
                </div>
                <p style={{ color: "var(--fg-dim)", fontSize: "var(--t-xs)", margin: "7px 0 0" }}>{t.oneLiner}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9 }}>
                  <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.category}</span>
                  <a href={t.url ?? `https://${t.domain}`} target="_blank" rel="noreferrer" style={{ fontSize: "var(--t-xs)", color: "var(--teal)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="link" size={12} />
                    {t.domain}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Pane>
    </div>
  );
}

function chipStyle(active: boolean) {
  return {
    padding: "5px 11px",
    borderRadius: "var(--r-full)",
    border: `1px solid ${active ? "var(--line-teal)" : "var(--line)"}`,
    background: active ? "var(--teal-dim)" : "transparent",
    color: active ? "var(--teal)" : "var(--fg-dim)",
    fontSize: "var(--t-xs)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    textTransform: "capitalize" as const,
  };
}
