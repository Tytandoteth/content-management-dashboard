"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Pane, Btn, StatusPill } from "./ui";

interface PlanStep { tool: string; args: Record<string, unknown>; reason?: string }
interface OrchestrateResponse { plan: { summary: string; steps: PlanStep[]; planner: string }; executed: boolean; status: string; createdItemIds: string[]; error?: string }
interface Run { id: string; request: string; summary: string; planner: string; status: string; createdItemIds: string[]; createdAt: string }

function PlannerBadge({ planner }: { planner: string }) {
  const real = planner !== "heuristic";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "var(--r-sm)", color: real ? "var(--cream)" : "var(--muted)", background: real ? "var(--cream-dim)" : "var(--ink-700)", border: `1px solid ${real ? "rgba(139,124,255,0.3)" : "var(--line)"}` }}>
      <Icon name={real ? "sparkles" : "bolt"} size={11} />{planner}
    </span>
  );
}

function StepCard({ step, index }: { step: PlanStep; index: number }) {
  const args = Object.entries(step.args).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  return (
    <div style={{ display: "flex", gap: 11, padding: "11px 12px", borderRadius: "var(--r-md)", background: "var(--ink-850)", border: "1px solid var(--line)" }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--faint)", paddingTop: 2 }}>{String(index + 1).padStart(2, "0")}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: "var(--t-sm)", lineHeight: 1.5, wordBreak: "break-word" }}>
          <span style={{ color: "var(--teal)" }}>{step.tool}</span><span style={{ color: "var(--muted)" }}>(</span><span style={{ color: "var(--fg-dim)" }}>{args}</span><span style={{ color: "var(--muted)" }}>)</span>
        </div>
        {step.reason && <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 4 }}>{step.reason}</div>}
      </div>
    </div>
  );
}

export function ChatScreen() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [resp, setResp] = useState<OrchestrateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/orchestration-runs").then((x) => x.json()).catch(() => ({ runs: [] }));
    setRuns(r.runs ?? []);
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function send(execute: boolean) {
    if (!request.trim()) return;
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, execute }) });
      const data = (await res.json()) as OrchestrateResponse;
      if (!res.ok) { setErr(data.error ?? `Failed (${res.status})`); return; }
      setResp(data);
      if (execute) { await loadHistory(); router.refresh(); }
    } finally { setBusy(false); }
  }

  const done = resp?.executed && resp.status === "executed";

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }} className="se-pd-top">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Pane label="Ask" title="Describe what you want" accent="var(--teal)">
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ color: "var(--teal)", marginTop: 11 }}><Icon name="sparkles" size={18} /></span>
            <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} placeholder="Turn last week's podcast into 8 clips and queue them for weekday noon…" style={{ flex: 1, resize: "none", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "10px 12px", fontSize: "var(--t-md)", fontFamily: "var(--font-body)", lineHeight: 1.5 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
            <Btn kind="ghost" size="sm" icon="eye" disabled={busy || !request.trim()} onClick={() => send(false)}>Preview plan</Btn>
            <Btn kind="primary" size="sm" icon="bolt" disabled={busy || !request.trim()} onClick={() => send(true)}>{busy ? "Running…" : "Run"}</Btn>
          </div>
          {err && <p style={{ marginTop: 10, fontSize: "var(--t-xs)", color: "var(--danger)" }}>{err}</p>}
          {resp && (
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px dashed var(--line-strong)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><span className="label">Plan</span><PlannerBadge planner={resp.plan.planner} /></div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, marginBottom: 11 }}>{resp.plan.summary}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{resp.plan.steps.map((s, i) => <StepCard key={i} step={s} index={i} />)}</div>
              {done && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: "var(--teal-dim)", border: "1px solid var(--line-teal)", borderRadius: "var(--r-md)" }}>
                  <span className="display tnum" style={{ fontSize: "var(--t-xl)", fontWeight: 700, color: "var(--teal)" }}>{resp.createdItemIds.length}</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 500 }}>drafts created → awaiting approval</div></div>
                  <Link href="/approval" style={{ textDecoration: "none" }}><Btn kind="primary" size="sm" iconRight="arrowRight">Go to inbox</Btn></Link>
                </div>
              )}
            </div>
          )}
        </Pane>
      </div>

      <Pane label="History" title="Past runs" pad={false}>
        {runs.length === 0 ? (
          <div style={{ padding: 16, fontSize: "var(--t-sm)", color: "var(--muted)" }}>No runs yet.</div>
        ) : runs.map((r) => (
          <div key={r.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <PlannerBadge planner={r.planner} />
              <StatusPill status={r.status === "executed" ? "published" : r.status === "failed" ? "rejected" : "draft"} size="sm" dot={false} />
              <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--faint)" }}>{new Date(r.createdAt).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.request}</div>
            <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 4 }}>{r.createdItemIds.length} item(s)</div>
          </div>
        ))}
      </Pane>
    </div>
  );
}
