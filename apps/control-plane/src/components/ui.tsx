"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import { STATUS_MAP, BRANDS, abbrev } from "@/lib/design";

/* ---------- animated number ---------- */
export function NumberRoll({
  value,
  format = (v) => String(Math.round(v)),
  dur = 700,
  className,
  style,
}: {
  value: number;
  format?: (v: number) => string;
  dur?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [disp, setDisp] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisp(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(value * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, dur]);
  return <span className={className} style={style}>{format(disp)}</span>;
}

/* ---------- pane ---------- */
export function Pane({
  title, action, children, pad = true, style, label, accent,
}: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean;
  style?: CSSProperties; label?: string; accent?: string;
}) {
  return (
    <section style={{ background: "var(--ink-800)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-card)", position: "relative", overflow: "hidden", ...style }}>
      {accent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent 70%)` }} />}
      {(title || action) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {label && <span className="label">{label}</span>}
            {title && <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--fg)" }}>{title}</h3>}
          </div>
          {action}
        </header>
      )}
      <div style={{ padding: pad ? 16 : 0 }}>{children}</div>
    </section>
  );
}

/* ---------- button ---------- */
type BtnKind = "primary" | "cream" | "danger" | "solid" | "ghost" | "bare";
export function Btn({
  children, kind = "ghost", size = "md", icon, iconRight, onClick, disabled, full, style, title,
}: {
  children?: ReactNode; kind?: BtnKind; size?: "sm" | "md" | "lg"; icon?: string; iconRight?: string;
  onClick?: () => void; disabled?: boolean; full?: boolean; style?: CSSProperties; title?: string;
}) {
  const [hover, setHover] = useState(false);
  const sizes: Record<string, [string, string]> = { sm: ["6px 10px", "var(--t-sm)"], md: ["8px 13px", "var(--t-base)"], lg: ["11px 18px", "var(--t-md)"] };
  const [pad, fs] = sizes[size]!;
  const kinds: Record<BtnKind, CSSProperties> = {
    primary: { background: hover ? "var(--teal-bright)" : "var(--teal)", color: "var(--ink-1000)", fontWeight: 600, boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 18px -8px var(--teal)" },
    cream: { background: hover ? "var(--cream-bright)" : "var(--cream)", color: "var(--ink-1000)", fontWeight: 600, boxShadow: "0 6px 18px -8px var(--cream)" },
    danger: { background: "var(--danger)", color: "#2a0a12", fontWeight: 600 },
    solid: { background: hover ? "var(--ink-650)" : "var(--ink-700)", color: "var(--fg)", border: "1px solid var(--line-strong)" },
    ghost: { background: hover ? "var(--ink-700)" : "transparent", color: "var(--fg-dim)", border: "1px solid var(--line)" },
    bare: { background: hover ? "var(--ink-700)" : "transparent", color: "var(--fg-dim)", border: "1px solid transparent" },
  };
  return (
    <button title={title} onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: pad, fontSize: fs, fontWeight: 500, borderRadius: "var(--r-md)", border: "1px solid transparent", lineHeight: 1, whiteSpace: "nowrap", width: full ? "100%" : "auto", transition: "background var(--dur-fast), border-color var(--dur-fast)", opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", ...kinds[kind], ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 13 : 15} />}
    </button>
  );
}

/* ---------- status pill ---------- */
export function StatusPill({ status, size = "md", dot = true }: { status: string; size?: "sm" | "md"; dot?: boolean }) {
  const s = STATUS_MAP[status];
  if (!s) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: size === "sm" ? "2px 7px 2px 6px" : "3px 9px 3px 7px", borderRadius: "var(--r-full)", background: s.bg, color: s.color, border: `1px solid color-mix(in oklab, ${s.color} 36%, transparent)`, fontSize: size === "sm" ? "var(--t-xs)" : "11px", fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, boxShadow: status === "published" || status === "measured" ? `0 0 6px ${s.color}` : "none" }} />}
      {s.label}
    </span>
  );
}

/* ---------- progress bar ---------- */
export function ProgressBar({ value, color = "var(--teal)", track = "var(--ink-700)", height = 6, ghost = false }: { value: number; color?: string; track?: string; height?: number; ghost?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  if (ghost) return <div style={{ height, borderRadius: 99, background: "repeating-linear-gradient(90deg, var(--line-strong) 0 6px, transparent 6px 12px)" }} />;
  return (
    <div style={{ position: "relative", height, borderRadius: "var(--r-full)", background: track, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: v * 100 + "%", background: `linear-gradient(90deg, color-mix(in oklab, ${color} 70%, transparent), ${color})`, borderRadius: "var(--r-full)", transformOrigin: "left", animation: "growx var(--dur-slow) var(--ease-out) both", boxShadow: `0 0 10px -2px ${color}` }} />
    </div>
  );
}

/* ---------- sparkline ---------- */
export function Sparkline({ data, w = 120, h = 36, color = "var(--teal)", fill = true, dots = false }: { data: number[]; w?: number; h?: number; color?: string; fill?: boolean; dots?: boolean }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * (w - 4) + 2, h - 3 - ((d - min) / rng) * (h - 6)] as const);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const id = "sg" + Math.round(w + h + data.length + data[0]!);
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${path} L ${w - 2} ${h} L 2 ${h} Z`} fill={`url(#${id})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {dots && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={color} />)}
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

/* ---------- badges ---------- */
export function BrandBadge({ brand, size = "md" }: { brand: string; size?: "sm" | "md" }) {
  const b = BRANDS[brand];
  if (!b) return null;
  const sm = size === "sm";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: sm ? "1px 6px" : "2px 8px", borderRadius: "var(--r-sm)", background: b.dim, color: b.color, border: `1px solid ${b.border}`, fontSize: sm ? "10px" : "var(--t-xs)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.4, fontFamily: "var(--font-mono)" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: b.color }} />{b.label}
    </span>
  );
}
export function PaidTag({ paid }: { paid: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--r-sm)", color: paid ? "var(--paid)" : "var(--muted)", background: paid ? "var(--warn-bg)" : "transparent", border: `1px solid ${paid ? "color-mix(in oklab, var(--paid) 32%, transparent)" : "var(--line)"}`, fontFamily: "var(--font-mono)" }}>{paid ? "Paid" : "Organic"}</span>
  );
}
export function UtmTag() {
  return (
    <span title="UTM auto-tagged" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em", padding: "2px 6px 2px 5px", borderRadius: "var(--r-sm)", color: "var(--utm)", background: "rgba(56,198,192,0.10)", border: "1px solid color-mix(in oklab, var(--utm) 30%, transparent)", fontFamily: "var(--font-mono)" }}>
      <Icon name="link" size={10} /> UTM
    </span>
  );
}
export function EngineHealthChip({ health, label }: { health: "ok" | "degraded" | "down"; label?: string }) {
  const map = { ok: ["var(--ok)", "var(--ok-bg)", "OK"], degraded: ["var(--warn)", "var(--warn-bg)", "Degraded"], down: ["var(--danger)", "var(--danger-bg)", "Down"] } as const;
  const [c, bg, txt] = map[health];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: "var(--r-full)", background: bg, color: c, border: `1px solid color-mix(in oklab, ${c} 30%, transparent)`, fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: health === "ok" ? `0 0 6px ${c}` : "none" }} /> {label || txt}
    </span>
  );
}

/* ---------- vesting ring ---------- */
export function VestingRing({ value, color, size = 132, stroke = 9, label = "vesting" }: { value: number; color: string; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-700)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 900ms var(--ease-out)", filter: `drop-shadow(0 0 6px color-mix(in oklab, ${color} 60%, transparent))` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="display tnum" style={{ fontSize: size > 120 ? "var(--t-3xl)" : "var(--t-2xl)", fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
          <NumberRoll value={value} format={(v) => v.toFixed(value < 10 ? 1 : 0)} /><span style={{ fontSize: "0.5em", fontWeight: 700 }}>%</span>
        </span>
        <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>{label}</span>
      </div>
    </div>
  );
}

/* ---------- stats ---------- */
export function HeroStat({ label, value, color = "var(--fg)" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="display tnum" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
        <NumberRoll value={value} format={(v) => abbrev(v)} />
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export function SumStat({ label, value, color = "var(--fg)" }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="display tnum" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ---------- empty / error ---------- */
export function EmptyState({ icon = "check", title, hint, accent = "var(--teal)" }: { icon?: string; title: string; hint?: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 24px", gap: 10 }}>
      <div style={{ width: 46, height: 46, borderRadius: "var(--r-lg)", display: "grid", placeItems: "center", background: `color-mix(in oklab, ${accent} 10%, transparent)`, color: accent, border: `1px solid color-mix(in oklab, ${accent} 26%, transparent)` }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)" }}>{title}</div>
      {hint && <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)", maxWidth: 300 }}>{hint}</div>}
    </div>
  );
}
export function ErrorState({ title, reasons = [], kind = "danger", icon = "alert" }: { title: string; reasons?: string[]; kind?: "danger" | "warn" | "info"; icon?: string }) {
  const c = kind === "danger" ? "var(--danger)" : kind === "warn" ? "var(--warn)" : "var(--info)";
  const bg = kind === "danger" ? "var(--danger-bg)" : kind === "warn" ? "var(--warn-bg)" : "var(--info-bg)";
  return (
    <div style={{ borderRadius: "var(--r-md)", border: `1px solid color-mix(in oklab, ${c} 36%, transparent)`, background: bg, padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ color: c, marginTop: 1 }}><Icon name={icon} size={18} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "var(--t-base)", fontWeight: 600, color: "var(--fg)" }}>{title}</div>
        {reasons.length > 0 && (
          <ul style={{ margin: "7px 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {reasons.map((r, i) => <li key={i} style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.5 }}>{r}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
