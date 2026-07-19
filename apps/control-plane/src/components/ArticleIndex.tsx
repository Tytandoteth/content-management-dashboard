"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Public, searchable index of resource articles — one per carousel post. A
 * viewer searches a video name or a tool and lands on the article with links.
 */
interface Row {
  slug: string;
  title: string;
  tools: string[];
}

export function ArticleIndex({ articles }: { articles: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(t) || a.tools.some((tool) => tool.toLowerCase().includes(t)),
    );
  }, [q, articles]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-950)", color: "var(--fg)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 22px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: 9, display: "block" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>{process.env.NEXT_PUBLIC_BRAND_DISPLAY_NAME || "Your Brand"} <span style={{ color: "var(--muted)", fontWeight: 600 }}>· resources</span></span>
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-3xl)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Every tool, every link.</h1>
        <p style={{ fontSize: "var(--t-md)", color: "var(--fg-dim)", margin: "0 0 22px" }}>Search a video or a tool to find the full resource guide for it.</p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a tool or topic — e.g. Opus Clips, automation…"
          style={{ width: "100%", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-lg)", padding: "13px 16px", fontSize: "var(--t-md)", fontFamily: "var(--font-body)", marginBottom: 18 }}
        />

        {filtered.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)", padding: "24px 0" }}>No resource guides yet{q ? " for that search" : ""}.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((a) => (
              <Link key={a.slug} href={`/r/${a.slug}`} style={{ display: "block", padding: "16px 18px", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--ink-900)", textDecoration: "none" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)" }}>{a.title}</div>
                {a.tools.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {a.tools.map((tool, i) => (
                      <span key={i} style={{ fontSize: "var(--t-xs)", color: "var(--teal)", background: "var(--teal-dim)", border: "1px solid var(--line-teal)", borderRadius: 999, padding: "3px 10px" }}>{tool}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
