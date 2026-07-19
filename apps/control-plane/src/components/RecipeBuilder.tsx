"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTENT_TYPES, BRAND_SURFACES, DEFAULT_BRAND_SURFACE } from "@cmd/contracts";
import { Icon } from "./Icon";
import { Pane, Btn } from "./ui";

export function RecipeBuilder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("carousel");
  const [brand, setBrand] = useState<string>(DEFAULT_BRAND_SURFACE);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [kind, setKind] = useState<"weekday_slots" | "immediate">("weekday_slots");
  const [hour, setHour] = useState(12);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sel: React.CSSProperties = { background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "8px 10px", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)" };

  async function save() {
    if (!name.trim() || !prompt.trim()) { setErr("name and prompt are required"); return; }
    setErr(null); setBusy(true);
    try {
      const spec = {
        brief: { type, prompt, brandSurface: brand },
        count: Math.max(1, count),
        schedule: kind === "immediate" ? { kind: "immediate" } : { kind: "weekday_slots", hour, minute: 0 },
      };
      const res = await fetch("/api/recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, spec }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? `Failed (${res.status})`); return; }
      setName(""); setPrompt(""); setCount(1); setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!open) {
    return <div style={{ marginBottom: 16 }}><Btn kind="solid" size="sm" icon="plus" onClick={() => setOpen(true)}>New recipe</Btn></div>;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Pane label="Builder" title="New recipe" accent="var(--teal)"
        action={<button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}><Icon name="x" size={16} /></button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name — e.g. Weekly recap carousel" style={sel} />
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="Brief / prompt for the generator…" style={{ ...sel, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type
              <select value={type} onChange={(e) => setType(e.target.value)} style={sel}>{CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Brand
              <select value={brand} onChange={(e) => setBrand(e.target.value)} style={sel}>{BRAND_SURFACES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Count
              <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ ...sel, width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Schedule
              <select value={kind} onChange={(e) => setKind(e.target.value as never)} style={sel}><option value="weekday_slots">Weekday slots</option><option value="immediate">On approval</option></select>
            </label>
            {kind === "weekday_slots" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Hour (UTC)
                <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ ...sel, width: 80 }} />
              </label>
            )}
          </div>
          {err && <p style={{ fontSize: "var(--t-xs)", color: "var(--danger)" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="primary" size="sm" icon="check" disabled={busy} onClick={save}>Save recipe</Btn>
            <Btn kind="bare" size="sm" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      </Pane>
    </div>
  );
}
