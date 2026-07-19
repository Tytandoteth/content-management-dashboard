"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

/**
 * Topics studio — the top of the funnel. Paste trending TikTok search terms
 * (e.g. straight from the search-suggestions screen, volume numbers and all) or
 * your own ideas, one per line. We strip the volume/trend noise, then turn each
 * line into a branded money/time carousel draft. Generation runs client-side,
 * one topic at a time, so you see progress and reuse the same /api/generate path.
 */

type RowStatus = "pending" | "running" | "done" | "error";
interface Row {
  topic: string;
  status: RowStatus;
  id?: string;
  error?: string;
}

/** Strip trailing volume/trend annotations a TikTok search paste carries. */
function cleanTopic(line: string): string {
  let s = line.trim().replace(/^[•\-*•\s]+/, "");
  let prev = "";
  // Repeatedly drop a trailing token: 636K / 1.34M, ▲129.6%, 1000%+, or a bare
  // 3+ digit volume like 599. Leading numbers (e.g. "5 ways") are preserved.
  while (s !== prev) {
    prev = s;
    s = s.replace(/\s*(?:\d[\d.,]*[KMB]\b|▲?\s*[\d.,]+%\+?|▲\s*[\d.,]+|\b\d{3,}\b)\s*$/i, "").trim();
  }
  return s;
}

export function TopicsStudio() {
  const [text, setText] = useState("");
  const [slides, setSlides] = useState(5);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const topics = useMemo(() => {
    const seen = new Set<string>();
    return text
      .split("\n")
      .map(cleanTopic)
      .filter((t) => t.length >= 3 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
      .slice(0, 20);
  }, [text]);

  const generate = async () => {
    if (running || topics.length === 0) return;
    setRunning(true);
    const initial: Row[] = topics.map((topic) => ({ topic, status: "pending" }));
    setRows(initial);

    for (let i = 0; i < topics.length; i++) {
      setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "running" } : row)));
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "carousel", brandSurface: "default", prompt: topics[i], count: slides }),
        });
        const d = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (!res.ok) throw new Error((d as { error?: string }).error ?? `failed (${res.status})`);
        const id = (d as { items?: Array<{ id?: string }> }).items?.[0]?.id;
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "done", id } : row)));
      } catch (e) {
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "error", error: e instanceof Error ? e.message : String(e) } : row)));
      }
    }
    setRunning(false);
  };

  const doneCount = rows.filter((r) => r.status === "done").length;

  const sel: React.CSSProperties = {
    background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)",
    borderRadius: "var(--r-md)", padding: "8px 10px", fontSize: "var(--t-sm)", fontFamily: "var(--font-body)",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Topics</h1>
      </div>
      <p style={{ marginTop: 0, marginBottom: 18, color: "var(--muted)", fontSize: "var(--t-sm)", maxWidth: 640 }}>
        Paste trending TikTok search terms (volume numbers and all) or your own ideas — one per line. Each becomes a branded
        money/time carousel draft. Tip: a number in the line (&ldquo;5 ways&hellip;&rdquo;) makes a list of exactly that many.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"what is ai automation 636K ▲129.6%\ncool things you can do with AI 834K\n5 AI tools that replace a freelancer\nbest AI humanizer 370K"}
        style={{ ...sel, width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <span className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>{topics.length} topic{topics.length === 1 ? "" : "s"} parsed</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", color: "var(--muted)" }}>
          slides
          <input type="number" min={3} max={12} value={slides} onChange={(e) => setSlides(Math.max(3, Math.min(12, Number(e.target.value) || 5)))} disabled={running} style={{ ...sel, width: 64 }} />
        </label>
        <button
          onClick={generate}
          disabled={running || topics.length === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: "var(--r-md)", border: "none", cursor: running || topics.length === 0 ? "default" : "pointer", background: "var(--teal)", color: "#fff", fontWeight: 600, fontSize: "var(--t-sm)", opacity: running || topics.length === 0 ? 0.6 : 1 }}
        >
          <Icon name="sparkles" size={15} />
          {running ? `Generating… ${doneCount}/${topics.length}` : `Generate ${topics.length || ""} carousel${topics.length === 1 ? "" : "s"}`}
        </button>
        {rows.length > 0 && !running && (
          <Link href="/content?status=draft" style={{ fontSize: "var(--t-sm)", color: "var(--teal)", textDecoration: "none" }}>
            {doneCount} created → review in Content
          </Link>
        )}
      </div>

      {topics.length > 0 && rows.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {topics.map((t, i) => (
            <span key={i} style={{ fontSize: "var(--t-xs)", color: "var(--fg-dim)", background: "var(--ink-850)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 12px" }}>{t}</span>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--ink-900)" }}>
              <StatusDot status={row.status} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.topic}</span>
              {row.status === "done" && row.id && (
                <Link href={`/content/${row.id}`} style={{ fontSize: "var(--t-xs)", color: "var(--teal)", textDecoration: "none" }}>view</Link>
              )}
              {row.status === "error" && (
                <span style={{ fontSize: "var(--t-xs)", color: "var(--st-rejected, #ff6b6b)" }}>{row.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: RowStatus }) {
  const color = status === "done" ? "var(--teal)" : status === "error" ? "var(--st-rejected, #ff6b6b)" : status === "running" ? "var(--warn, #f5b13d)" : "var(--muted)";
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}
