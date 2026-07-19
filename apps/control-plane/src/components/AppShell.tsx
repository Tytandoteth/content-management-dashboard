"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { Icon } from "./Icon";

// Local-dev escape hatch (NEXT_PUBLIC_DISABLE_AUTH=true): when set, Clerk is not
// mounted, so we must not call any Clerk hooks. The user chip is split out so
// useUser() only runs when auth is enabled.
const AUTH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

function UserChip() {
  const { isSignedIn } = useUser();
  return isSignedIn ? (
    <UserButton appearance={{ elements: { avatarBox: { width: 30, height: 30, border: "1px solid var(--line-strong)" } } }} />
  ) : (
    <Link href="/sign-in" style={{ fontSize: "var(--t-sm)", color: "var(--teal)", textDecoration: "none", border: "1px solid var(--line-teal)", borderRadius: "var(--r-md)", padding: "6px 12px" }}>
      Sign in
    </Link>
  );
}

// Ordered to match the content funnel: ideate → make → approve → post → plan.
const NAV = [
  { id: "/", label: "Dashboard", icon: "dashboard" },
  { id: "/topics", label: "Topics", icon: "lightbulb" },
  { id: "/tools", label: "Tools", icon: "bolt" },
  { id: "/record", label: "Record", icon: "video" },
  { id: "/content", label: "Content", icon: "content" },
  { id: "/board", label: "Board", icon: "list" },
  { id: "/approval", label: "Approval", icon: "inbox", review: true },
  { id: "/staged", label: "Ready to post", icon: "send" },
  { id: "/replies", label: "Replies", icon: "thread" },
  { id: "/calendar", label: "Calendar", icon: "calendar" },
  { id: "/recipes", label: "Recipes", icon: "recipes" },
  { id: "/engines", label: "Engines", icon: "engines" },
  { id: "/chat", label: "Chat", icon: "sparkles" },
  { id: "/settings", label: "Settings", icon: "settings" },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard", "/topics": "Topics", "/tools": "Tools", "/record": "Record", "/content": "Content", "/board": "Board", "/approval": "Approval", "/staged": "Ready to post",
  "/replies": "Replies", "/calendar": "Calendar", "/recipes": "Recipes", "/engines": "Engines", "/chat": "Chat", "/settings": "Settings",
};

// Configurable brand display name for the sidebar wordmark. AppShell is a
// client component, so it can't import @cmd/brand (non-NEXT_PUBLIC env vars are
// stripped from the browser bundle and would always resolve to the default).
// It reads the NEXT_PUBLIC_ mirror of BRAND_DISPLAY_NAME instead — Next inlines
// it at build time. Keep this default in sync with @cmd/brand's neutral one.
const BRAND_DISPLAY_NAME = process.env.NEXT_PUBLIC_BRAND_DISPLAY_NAME || "Your Brand";

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt={BRAND_DISPLAY_NAME} width={24} height={24} style={{ flexShrink: 0, borderRadius: 7, display: "block" }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)" }}>
        {BRAND_DISPLAY_NAME}
      </span>
    </div>
  );
}

function HealthPill({ engines, review }: { engines: { up: number; total: number } | null; review: number }) {
  // null = still loading — say so instead of pretending the system is healthy.
  const status = engines === null ? "checking" : engines.up < engines.total ? "degraded" : "ok";
  const color = status === "ok" ? "var(--ok)" : status === "degraded" ? "var(--warn)" : "var(--muted)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "11px 12px", background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: status === "checking" ? "none" : `0 0 6px ${color}`, animation: status === "checking" ? "none" : "pulse-dot 1.6s infinite" }} />
        <span style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "var(--fg)", textTransform: "capitalize" }}>{status === "checking" ? "Checking…" : `System ${status}`}</span>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <HBit label="Engines" up={engines?.up ?? 0} total={engines?.total ?? 0} />
        <div>
          <div className="mono tnum" style={{ fontSize: "var(--t-sm)", color: review ? "var(--st-review)" : "var(--teal)", fontWeight: 500 }}>{review}</div>
          <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>Review</div>
        </div>
      </div>
    </div>
  );
}
function HBit({ label, up, total }: { label: string; up: number; total: number }) {
  const warn = up < total;
  return (
    <div>
      <div className="mono tnum" style={{ fontSize: "var(--t-sm)", color: warn ? "var(--warn)" : "var(--teal)", fontWeight: 500 }}>{up}/{total}</div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  if (!open) return null;
  const cmds = NAV.map((n) => ({ kind: "Go to", label: n.label, icon: n.icon, run: () => router.push(n.id) }));
  const filtered = q ? cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())) : cmds;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,7,10,0.6)", backdropFilter: "blur(4px)", display: "grid", placeItems: "start center", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 92vw)", background: "var(--ink-800)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-pop)", overflow: "hidden", animation: "rise var(--dur-med) var(--ease-out)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ color: "var(--teal)" }}><Icon name="command" size={18} /></span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search screens…"
            onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) { filtered[0].run(); onClose(); } if (e.key === "Escape") onClose(); }}
            style={{ flex: 1, background: "transparent", border: "none", color: "var(--fg)", fontSize: "var(--t-md)", fontFamily: "var(--font-body)", outline: "none" }} />
          <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--faint)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "2px 6px" }}>esc</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 8 }}>
          {filtered.map((c, i) => (
            <button key={i} onClick={() => { c.run(); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 11px", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", textAlign: "left", background: i === 0 ? "var(--ink-700)" : "transparent", color: "var(--fg)", fontFamily: "var(--font-body)" }}>
              <span style={{ color: "var(--muted)" }}><Icon name={c.icon} size={15} /></span>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", width: 56 }}>{c.kind}</span>
              <span style={{ fontSize: "var(--t-base)" }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [palette, setPalette] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [review, setReview] = useState(0);
  const [engines, setEngines] = useState<{ up: number; total: number } | null>(null);

  // Restore persisted theme on mount.
  useEffect(() => {
    const saved = localStorage.getItem("cmd-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cmd-theme", theme);
  }, [theme]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    fetch("/api/content?status=in_review").then((r) => r.json()).then((d) => setReview((d.items ?? []).length)).catch(() => {});
    fetch("/api/generators").then((r) => r.json()).then((d) => {
      const gs = d.generators ?? [];
      setEngines({ up: gs.filter((g: { health: string }) => g.health === "ok").length, total: gs.length });
    }).catch(() => {});
  }, [pathname]);

  const isActive = (id: string) => (id === "/" ? pathname === "/" : pathname.startsWith(id));
  const title = useMemo(() => {
    const hit = NAV.find((n) => isActive(n.id));
    return hit ? TITLES[hit.id] : "";
  }, [pathname]);

  // Public resource articles (/r/...) render bare — no dashboard chrome.
  // Must not match "/record", "/recipes", "/replies" (they also start with "/r").
  if (pathname === "/r" || pathname.startsWith("/r/")) return <>{children}</>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "214px 1fr", height: "100vh", overflow: "hidden", background: "var(--ink-950)", backgroundImage: "var(--mesh)" }} className="se-shell">
      <aside className={"se-rail" + (railOpen ? " open" : "")} style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", background: "var(--ink-850)", minHeight: 0 }}>
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--line)" }}><Wordmark /></div>
        <nav className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n) => {
            const on = isActive(n.id);
            return (
              <Link key={n.id} href={n.id} onClick={() => setRailOpen(false)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: "var(--r-md)", textDecoration: "none", textAlign: "left", fontFamily: "var(--font-body)", background: on ? "var(--teal-dim)" : "transparent", color: on ? "var(--teal)" : "var(--fg-dim)", fontSize: "var(--t-base)", fontWeight: on ? 600 : 500, position: "relative" }}>
                {on && <span style={{ position: "absolute", left: -10, top: 8, bottom: 8, width: 3, borderRadius: 99, background: "var(--teal)" }} />}
                <Icon name={n.icon} size={17} />{n.label}
                {n.review && review > 0 && (
                  <span className="display tnum" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--st-review)", background: "var(--st-review-bg)", borderRadius: "var(--r-full)", minWidth: 19, height: 18, display: "grid", placeItems: "center", padding: "0 5px" }}>{review}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}><HealthPill engines={engines} review={review} /></div>
      </aside>
      {railOpen && <div onClick={() => setRailOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(4,7,10,0.6)" }} />}

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 22px", height: 56, flexShrink: 0, borderBottom: "1px solid var(--line)", background: "color-mix(in oklab, var(--ink-850) 86%, transparent)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 30 }}>
          <button className="se-menu" onClick={() => setRailOpen((o) => !o)} style={{ display: "none", background: "transparent", border: "none", color: "var(--fg-dim)" }}><Icon name="list" size={20} /></button>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-lg)", fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h1>
          <button onClick={() => router.push("/chat")} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginLeft: 6, background: "var(--teal-dim)", border: "1px solid var(--line-teal)", color: "var(--teal)", borderRadius: "var(--r-full)", padding: "5px 12px 5px 10px", fontSize: "var(--t-sm)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            <Icon name="sparkles" size={14} />Ask
          </button>
          <button onClick={() => setPalette(true)} className="se-cmd" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, width: "min(280px, 30vw)", background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "7px 11px", color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            <Icon name="search" size={14} />
            <span style={{ fontSize: "var(--t-sm)" }}>Search or run a command</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10, border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", padding: "1px 5px" }}>⌘K</span>
          </button>
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme" style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-md)", color: "var(--fg-dim)", padding: 7, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
          </button>
          {AUTH_DISABLED ? (
            <span className="mono" title="NEXT_PUBLIC_DISABLE_AUTH=true" style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "4px 8px" }}>
              local dev
            </span>
          ) : (
            <UserChip />
          )}
        </header>
        <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "22px 24px 40px" }}>{children}</div>
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <style>{`
        .se-menu { display: none; }
        @media (max-width: 880px) {
          .se-shell { grid-template-columns: 1fr !important; }
          .se-rail { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; z-index: 50; transform: translateX(-100%); transition: transform var(--dur-med) var(--ease-out); }
          .se-rail.open { transform: translateX(0); }
          .se-menu { display: grid !important; place-items: center; }
          .se-cmd span:not(.mono) { display: none; }
          .se-cmd { width: auto !important; }
        }
      `}</style>
    </div>
  );
}
