"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Btn } from "./ui";

interface PlanStep { tool: string; args: Record<string, unknown>; reason?: string }
interface OrchestrateResponse {
  plan: { summary: string; steps: PlanStep[]; planner: string };
  executed: boolean; status: string; createdItemIds: string[]; error?: string;
}

function PlannerBadge({ planner }: { planner: string }) {
  const claude = planner === "claude";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "var(--r-sm)", color: claude ? "var(--cream)" : "var(--muted)", background: claude ? "var(--cream-dim)" : "var(--ink-700)", border: `1px solid ${claude ? "rgba(139,124,255,0.3)" : "var(--line)"}` }}>
      <Icon name={claude ? "sparkles" : "bolt"} size={11} />{claude ? "claude" : "heuristic"}
    </span>
  );
}

function ToolCallCard({ step, index, done }: { step: PlanStep; index: number; done: boolean }) {
  const args = Object.entries(step.args).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  return (
    <div style={{ display: "flex", gap: 11, padding: "11px 12px", borderRadius: "var(--r-md)", background: "var(--ink-850)", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{String(index + 1).padStart(2, "0")}</span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: done ? "var(--st-measured)" : "var(--muted)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--fg)", lineHeight: 1.5, wordBreak: "break-word" }}>
          <span style={{ color: "var(--teal)" }}>{step.tool}</span>
          <span style={{ color: "var(--muted)" }}>(</span>
          <span style={{ color: "var(--fg-dim)" }}>{args}</span>
          <span style={{ color: "var(--muted)" }}>)</span>
        </div>
        {step.reason && <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{step.reason}</div>}
      </div>
      {done && <span style={{ color: "var(--st-measured)", alignSelf: "center" }}><Icon name="check" size={15} /></span>}
    </div>
  );
}

export function ChatAsk() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [resp, setResp] = useState<OrchestrateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(execute: boolean) {
    if (!request.trim()) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, execute }),
      });
      const data = (await res.json()) as OrchestrateResponse;
      if (!res.ok) { setError(data.error ?? `Failed (${res.status})`); return; }
      setResp(data);
      if (execute) startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  const done = resp?.executed && resp.status === "executed";

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <span style={{ color: "var(--teal)", marginTop: 11 }}><Icon name="sparkles" size={18} /></span>
        <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={2}
          placeholder="Make a carousel on the best AI tools for creators…"
          style={{ flex: 1, resize: "none", background: "var(--ink-900)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", padding: "10px 12px", fontSize: "var(--t-md)", fontFamily: "var(--font-body)", lineHeight: 1.5 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11, alignItems: "center" }}>
        <Btn kind="ghost" size="sm" icon="eye" disabled={busy || !request.trim()} onClick={() => send(false)}>Preview plan</Btn>
        <Btn kind="primary" size="sm" icon="bolt" disabled={busy || !request.trim()} onClick={() => send(true)}>{busy ? "Running…" : "Run"}</Btn>
      </div>

      {error && <p style={{ marginTop: 10, fontSize: "var(--t-xs)", color: "var(--danger)" }}>{error}</p>}

      {resp && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px dashed var(--line-strong)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span className="label">Plan</span>
            <PlannerBadge planner={resp.plan.planner} />
          </div>
          <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, marginBottom: 11 }}>{resp.plan.summary}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {resp.plan.steps.map((s, i) => <ToolCallCard key={i} step={s} index={i} done={!!done} />)}
          </div>
          {done && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: "var(--teal-dim)", border: "1px solid var(--line-teal)", borderRadius: "var(--r-md)" }}>
              <span className="display tnum" style={{ fontSize: "var(--t-xl)", fontWeight: 700, color: "var(--teal)" }}>{resp.createdItemIds.length}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 500 }}>drafts created → awaiting approval</div>
                <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>Nothing is public until you press the button.</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
