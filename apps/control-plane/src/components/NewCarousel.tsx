"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/**
 * Quick-create: type a topic → Claude writes the slides, Satori renders branded
 * PNGs, and a draft carousel lands in the approval queue. Posts to /api/generate
 * with type=carousel; on success jumps to the new item's detail page.
 */
export function NewCarousel({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [style, setStyle] = useState<"editorial" | "gradient-pop" | "paper-light" | "terminal-dev">("editorial");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const prompt = topic.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "carousel", prompt, count, brandSurface: "default", style }),
      });
      const d = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error((d as { error?: string }).error ?? `generation failed (${res.status})`);
      setTopic("");
      onCreated?.();
      const id = (d as { items?: Array<{ id?: string }> }).items?.[0]?.id;
      if (id) router.push(`/content/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sel: React.CSSProperties = {
    background: "var(--ink-900)",
    color: "var(--fg)",
    border: "1px solid var(--line-strong)",
    borderRadius: "var(--r-md)",
    padding: "8px 10px",
    fontSize: "var(--t-sm)",
    fontFamily: "var(--font-body)",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        padding: 12,
        marginBottom: 16,
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        background: "linear-gradient(120deg, rgba(255,122,26,0.08), rgba(230,210,181,0.05))",
      }}
    >
      <Icon name="carousel" size={18} />
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New carousel topic — e.g. “Fireflies.ai note-taker”"
        disabled={busy}
        style={{ ...sel, flex: 1, minWidth: 220 }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", color: "var(--muted)" }}>
        slides
        <input
          type="number"
          min={3}
          max={8}
          value={count}
          onChange={(e) => setCount(Math.max(3, Math.min(8, Number(e.target.value) || 5)))}
          disabled={busy}
          style={{ ...sel, width: 64 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", color: "var(--muted)" }}>
        style
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as typeof style)}
          disabled={busy}
          style={{ ...sel, cursor: "pointer" }}
        >
          <option value="editorial">Editorial</option>
          <option value="gradient-pop">Gradient Pop</option>
          <option value="paper-light">Paper Light</option>
          <option value="terminal-dev">Terminal Dev</option>
        </select>
      </label>
      <button
        onClick={submit}
        disabled={busy || !topic.trim()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: "var(--r-md)",
          border: "none",
          cursor: busy || !topic.trim() ? "default" : "pointer",
          background: "var(--teal)",
          color: "#fff",
          fontWeight: 600,
          fontSize: "var(--t-sm)",
          opacity: busy || !topic.trim() ? 0.6 : 1,
        }}
      >
        <Icon name="sparkles" size={15} />
        {busy ? "Generating…" : "Generate"}
      </button>
      {err && <span style={{ width: "100%", color: "var(--st-rejected, #ff6b6b)", fontSize: "var(--t-xs)" }}>{err}</span>}
    </div>
  );
}
