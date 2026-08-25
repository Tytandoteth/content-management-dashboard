"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Pane, Btn } from "./ui";

interface PlanStep { tool: string; args?: Record<string, unknown> }
interface StepResult { tool: string; ok: boolean; error?: string; note?: string }
type RunStatus = "planned" | "empty" | "executed" | "partial" | "failed";

interface OrchestrateResponse {
  planner: string;
  plan: { summary: string; steps: PlanStep[] };
  status: RunStatus;
  created: number;
  results: StepResult[];
  runId?: string;
}

interface Run {
  id: string;
  request: string;
  summary: string;
  planner: string;
  status: string;
  createdItemIds: string[];
  createdAt: string;
}

type HistoryState = "loading" | "ready" | "error";

/** "openrouter" -> "AI planner", "heuristic" -> "heuristic planner"; anything else shown as-is. */
function plannerLabel(planner: string): string {
  if (planner === "openrouter") return "AI planner";
  if (planner === "heuristic") return "heuristic planner";
  return planner;
}

function PlannerBadge({ planner }: { planner: string }) {
  const real = planner !== "heuristic";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "var(--r-sm)", color: real ? "var(--cream)" : "var(--muted)", background: real ? "var(--cream-dim)" : "var(--ink-700)", border: `1px solid ${real ? "rgba(139,124,255,0.3)" : "var(--line)"}` }}>
      <Icon name={real ? "sparkles" : "bolt"} size={11} />{plannerLabel(planner)}
    </span>
  );
}

/** Self-contained run-status badge. Distinct from content lifecycle status (StatusPill) — a run can't "publish". */
const RUN_STATUS_META: Record<string, { label: string; color: string; bg: string; animate?: boolean }> = {
  running: { label: "Running", color: "var(--muted)", bg: "var(--ink-700)", animate: true },
  planned: { label: "Preview", color: "var(--muted)", bg: "var(--ink-700)" },
  empty: { label: "Empty", color: "var(--muted)", bg: "var(--ink-700)" },
  executed: { label: "Completed", color: "var(--ok)", bg: "var(--ok-bg)" },
  partial: { label: "Partial", color: "var(--warn)", bg: "var(--warn-bg)" },
  failed: { label: "Failed", color: "var(--danger)", bg: "var(--danger-bg)" },
};

function RunStatusBadge({ status }: { status: string }) {
  const s = RUN_STATUS_META[status] ?? { label: status, color: "var(--muted)", bg: "var(--ink-700)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: "var(--r-full)", background: s.bg, color: s.color, border: `1px solid color-mix(in oklab, ${s.color} 34%, transparent)`, fontSize: "var(--t-xs)", fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, boxShadow: s.animate ? `0 0 6px ${s.color}` : "none", animation: s.animate ? "pulse-dot 1.6s infinite" : "none" }} />
      {s.label}
    </span>
  );
}

function StepCard({ step, index, result }: { step: PlanStep; index: number; result?: StepResult }) {
  const args = Object.entries(step.args ?? {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  const ok = result?.ok === true;
  const failed = result?.ok === false;
  return (
    <div style={{ display: "flex", gap: 11, padding: "11px 12px", borderRadius: "var(--r-md)", background: "var(--ink-850)", border: `1px solid ${failed ? "var(--danger)" : "var(--line)"}` }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--faint)", paddingTop: 2 }}>{String(index + 1).padStart(2, "0")}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: "var(--t-sm)", lineHeight: 1.5, wordBreak: "break-word" }}>
          <span style={{ color: "var(--teal)" }}>{step.tool}</span><span style={{ color: "var(--muted)" }}>(</span><span style={{ color: "var(--fg-dim)" }}>{args}</span><span style={{ color: "var(--muted)" }}>)</span>
        </div>
        {result?.note && <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 4 }}>{result.note}</div>}
        {failed && <div style={{ fontSize: "var(--t-xs)", color: "var(--danger)", marginTop: 4 }}>{result?.error ?? "Step failed."}</div>}
      </div>
      {ok && <span style={{ color: "var(--ok)", alignSelf: "center", flexShrink: 0 }}><Icon name="check" size={14} /></span>}
    </div>
  );
}

/** Status banner shown under the plan. "planned" (preview, not yet run) renders nothing. */
function ResultBanner({ resp }: { resp: OrchestrateResponse }) {
  const { status, created } = resp;
  const results = resp.results ?? [];

  if (status === "planned") return null;

  if (status === "empty") {
    return (
      <div style={{ marginTop: 12, padding: "11px 13px", background: "var(--ink-850)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
        <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)", lineHeight: 1.5 }}>
          The planner produced no actionable steps. Try describing a carousel, thread, or clip batch.
        </div>
      </div>
    );
  }

  const failed = results.filter((r) => !r.ok);

  if (status === "executed") {
    return (
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: "var(--ok-bg)", border: "1px solid color-mix(in oklab, var(--ok) 34%, transparent)", borderRadius: "var(--r-md)" }}>
        <span className="display tnum" style={{ fontSize: "var(--t-xl)", fontWeight: 700, color: "var(--ok)" }}>{created}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 500 }}>{created === 1 ? "draft" : "drafts"} created → awaiting approval</div>
        </div>
        <Link href="/approval" style={{ textDecoration: "none" }}><Btn kind="primary" size="sm" iconRight="arrowRight">Go to inbox</Btn></Link>
      </div>
    );
  }

  if (status === "partial") {
    return (
      <div style={{ marginTop: 12, padding: "11px 13px", background: "var(--warn-bg)", border: "1px solid color-mix(in oklab, var(--warn) 34%, transparent)", borderRadius: "var(--r-md)" }}>
        <div style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 500 }}>
          <span style={{ fontWeight: 700, color: "var(--warn)" }}>{created}</span> created, {failed.length} step{failed.length === 1 ? "" : "s"} failed
        </div>
        {failed.length > 0 && (
          <ul style={{ margin: "9px 0 0", paddingLeft: 18, fontSize: "var(--t-xs)", color: "var(--warn)", lineHeight: 1.5 }}>
            {failed.map((f, i) => <li key={i}><span className="mono">{f.tool}</span>{f.error ? `: ${f.error}` : ""}</li>)}
          </ul>
        )}
      </div>
    );
  }

  // failed
  return (
    <div style={{ marginTop: 12, padding: "11px 13px", background: "var(--danger-bg)", border: "1px solid color-mix(in oklab, var(--danger) 34%, transparent)", borderRadius: "var(--r-md)" }}>
      <div style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 600 }}>Run failed</div>
      {failed.length > 0 ? (
        <ul style={{ margin: "9px 0 0", paddingLeft: 18, fontSize: "var(--t-xs)", color: "var(--danger)", lineHeight: 1.5 }}>
          {failed.map((f, i) => <li key={i}><span className="mono">{f.tool}</span>{f.error ? `: ${f.error}` : ""}</li>)}
        </ul>
      ) : (
        <div style={{ marginTop: 6, fontSize: "var(--t-xs)", color: "var(--danger)" }}>Something went wrong while running these steps.</div>
      )}
    </div>
  );
}

/** Read a Response body as JSON without throwing (a 500 with an HTML/empty body must not crash the caller). */
async function parseJsonSafe(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

export function ChatScreen() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [resp, setResp] = useState<OrchestrateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      const res = await fetch("/api/orchestration-runs");
      const data = await parseJsonSafe(res);
      const list = data && typeof data === "object" ? (data as { runs?: unknown }).runs : undefined;
      if (!res.ok || !Array.isArray(list)) throw new Error(`status ${res.status}`);
      setRuns(list as Run[]);
      setHistoryState("ready");
    } catch {
      setHistoryState("error");
    }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Elapsed-seconds ticker for the in-flight run. Cleared on completion and on unmount.
  useEffect(() => {
    if (!executing) { setElapsed(0); return; }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [executing]);

  async function send(execute: boolean) {
    if (!request.trim()) return;
    setErr(null);
    setResp(null);
    setBusy(true);
    if (execute) setExecuting(true);
    try {
      const res = await fetch("/api/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, execute }) });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        const msg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : `server error (${res.status})`;
        setErr(msg);
        return;
      }
      if (!data || typeof data !== "object") {
        setErr(`server error (${res.status})`);
        return;
      }
      setResp(data as OrchestrateResponse);
      if (execute) { await loadHistory(); router.refresh(); }
    } catch {
      setErr("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
      setExecuting(false);
    }
  }

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
          {executing && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 6px var(--teal)", animation: "pulse-dot 1.6s infinite" }} />
                <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--fg-dim)" }}>Running… {elapsed}s</span>
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--faint)", marginTop: 4 }}>Generation can take a minute or two. Drafts land in the Approval inbox.</div>
            </div>
          )}
          {err && <p style={{ marginTop: 10, fontSize: "var(--t-xs)", color: "var(--danger)" }}>{err}</p>}
          {resp && (
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px dashed var(--line-strong)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><span className="label">Plan</span><PlannerBadge planner={resp.planner} /></div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, marginBottom: 11 }}>{resp.plan?.summary}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{(resp.plan?.steps ?? []).map((s, i) => <StepCard key={i} step={s} index={i} result={resp.results?.[i]} />)}</div>
              <ResultBanner resp={resp} />
            </div>
          )}
        </Pane>
      </div>

      <Pane label="History" title="Past runs" pad={false}>
        {historyState === "loading" ? (
          <div style={{ padding: 16, fontSize: "var(--t-sm)", color: "var(--muted)" }}>Loading runs…</div>
        ) : historyState === "error" ? (
          <div style={{ padding: 16, fontSize: "var(--t-sm)", color: "var(--danger)" }}>
            Couldn't load run history.{" "}
            <button onClick={() => void loadHistory()} style={{ background: "none", border: "none", padding: 0, margin: 0, color: "var(--teal)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Retry</button>
          </div>
        ) : runs.length === 0 ? (
          <div style={{ padding: 16, fontSize: "var(--t-sm)", color: "var(--muted)" }}>No runs yet.</div>
        ) : runs.map((r) => (
          <div key={r.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <PlannerBadge planner={r.planner} />
              <RunStatusBadge status={r.status} />
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
