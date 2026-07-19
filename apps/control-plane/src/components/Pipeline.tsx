"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus } from "@cmd/contracts";
import { LIFECYCLE } from "@/lib/design";
import { Icon } from "./Icon";
import { NumberRoll } from "./ui";

/**
 * The signature element: the content lifecycle as a living diagram — 7 stations
 * with live counts, an animated flow track, and the rejected branch looping back
 * to draft. Ported from the design handoff.
 */
export function LifecyclePipeline({
  counts,
  onStage,
  active,
}: {
  counts: Record<string, number>;
  onStage?: (s: string) => void;
  active?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const go = onStage ?? ((s: string) => router.push(`/content?status=${s}`));
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(es[0]!.contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const stages = LIFECYCLE;
  const n = stages.length;
  const colW = w / n;
  const cx = (i: number) => (i + 0.5) * colW;
  const trackY = 100;
  const H = 168;
  const loopBottom = 150;

  const idxReview = stages.findIndex((s) => s.id === "in_review");
  const idxDraft = stages.findIndex((s) => s.id === "draft");
  const rx = cx(idxReview), dx = cx(idxDraft);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: H, userSelect: "none" }}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <defs>
          {stages.slice(0, -1).map((s, i) => (
            <linearGradient key={i} id={`seg${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={s.color} />
              <stop offset="100%" stopColor={stages[i + 1]!.color} />
            </linearGradient>
          ))}
          <marker id="rejHead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0 0L6 3.5L0 7Z" fill="var(--st-rejected)" />
          </marker>
        </defs>
        <line x1={cx(0)} y1={trackY} x2={cx(n - 1)} y2={trackY} stroke="var(--line)" strokeWidth="2" />
        {stages.slice(0, -1).map((s, i) => (
          <line key={i} x1={cx(i)} y1={trackY} x2={cx(i + 1)} y2={trackY} stroke={`url(#seg${i})`} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" style={{ animation: "flow 1.1s linear infinite", opacity: 0.95 }} />
        ))}
        {stages.map((s, i) => (
          <g key={s.id}>
            <circle cx={cx(i)} cy={trackY} r="6.5" fill="var(--ink-900)" stroke={s.color} strokeWidth="2.5" />
            <circle cx={cx(i)} cy={trackY} r="2.5" fill={s.color} style={{ filter: i >= 5 ? `drop-shadow(0 0 4px ${s.color})` : "none" }} />
          </g>
        ))}
        <path d={`M ${rx} ${trackY + 7} C ${rx} ${loopBottom}, ${dx} ${loopBottom}, ${dx} ${trackY + 8}`} fill="none" stroke="var(--st-rejected)" strokeWidth="1.6" strokeDasharray="3 4" markerEnd="url(#rejHead)" opacity="0.85" />
      </svg>

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: trackY - 14, display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {stages.map((s, i) => {
          const isActive = active === s.id;
          return (
            <button key={s.id} onClick={() => go(s.id as ContentStatus)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "transparent", border: "none", padding: "6px 2px 0", cursor: "pointer", opacity: 0, animation: `rise var(--dur-slow) var(--ease-out) ${i * 60}ms forwards` }}>
              <span style={{ display: "flex", alignItems: "center", color: s.color, opacity: isActive ? 1 : 0.8 }}>
                <Icon name={s.glyph} size={13} />
              </span>
              <span className="display tnum" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, lineHeight: 1, color: isActive ? s.color : "var(--fg)", letterSpacing: "-0.02em" }}>
                <NumberRoll value={counts[s.id] ?? 0} dur={600 + i * 60} />
              </span>
              <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: isActive ? s.color : "var(--muted)", whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ width: isActive ? 18 : 0, height: 2, borderRadius: 2, background: s.color, marginTop: 2, transition: "width var(--dur-med) var(--ease-out)" }} />
            </button>
          );
        })}
      </div>

      <button onClick={() => go("rejected")} style={{ position: "absolute", top: loopBottom - 12, left: (rx + dx) / 2 - 60, width: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "var(--ink-850)", border: "1px solid color-mix(in oklab, var(--st-rejected) 38%, transparent)", borderRadius: "var(--r-full)", padding: "3px 11px", cursor: "pointer", opacity: 0, animation: "rise var(--dur-slow) var(--ease-out) 480ms forwards" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--st-rejected)" }} />
        <span className="display tnum" style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--st-rejected)" }}>{counts.rejected ?? 0}</span>
        <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600 }}>rejected</span>
      </button>
    </div>
  );
}
