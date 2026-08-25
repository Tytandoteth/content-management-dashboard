"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Btn } from "./ui";

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

/** Each card reflects its own step's result (or none, if the plan hasn't been run) — never a shared "done" flag. */
function ToolCallCard({ step, index, result }: { step: PlanStep; index: number; result?: StepResult }) {
  const args = Object.entries(step.args ?? {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  const ok = result?.ok === true;
  const failed = result?.ok === false;
  const dotColor = failed ? "var(--danger)" : ok ? "var(--ok)" : "var(--muted)";
  return (
    <div style={{ display: "flex", gap: 11, padding: "11px 12px", borderRadius: "var(--r-md)", background: "var(--ink-850)", border: `1px solid ${failed ? "var(--danger)" : "var(--line)"}` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{String(index + 1).padStart(2, "0")}</span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--fg)", lineHeight: 1.5, wordBreak: "break-word" }}>
          <span style={{ color: "var(--teal)" }}>{step.tool}</span>
          <span style={{ color: "var(--muted)" }}>(</span>
          <span style={{ color: "var(--fg-dim)" }}>{args}</span>
          <span style={{ color: "var(--muted)" }}>)</span>
        </div>
        {result?.note && <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{result.note}</div>}
        {failed && <div style={{ fontSize: "var(--t-xs)", color: "var(--danger)", marginTop: 4, lineHeight: 1.45 }}>{result?.error ?? "Step failed."}</div>}
      </div>
      {ok && <span style={{ color: "var(--ok)", alignSelf: "center", flexShrink: 0 }}><Icon name="check" size={15} /></span>}
      {failed && <span style={{ color: "var(--danger)", alignSelf: "center", flexShrink: 0 }}><Icon name="x" size={15} /></span>}
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
          <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>Nothing is public until you press the button.</div>
        </div>
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

export function ChatAsk() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [resp, setResp] = useState<OrchestrateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setResp(null);
    setBusy(true);
    if (execute) setExecuting(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, execute }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        const msg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : `server error (${res.status})`;
        setError(msg);
        return;
      }
      if (!data || typeof data !== "object") {
        setError(`server error (${res.status})`);
        return;
      }
      setResp(data as OrchestrateResponse);
      if (execute) startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
      setExecuting(false);
    }
  }

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

      {executing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 6px var(--teal)", animation: "pulse-dot 1.6s infinite" }} />
            <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--fg-dim)" }}>Running… {elapsed}s</span>
          </div>
          <div style={{ fontSize: "var(--t-xs)", color: "var(--faint)", marginTop: 4 }}>Generation can take a minute or two. Drafts land in the Approval inbox.</div>
        </div>
      )}

      {error && <p style={{ marginTop: 10, fontSize: "var(--t-xs)", color: "var(--danger)" }}>{error}</p>}

      {resp && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px dashed var(--line-strong)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span className="label">Plan</span>
            <PlannerBadge planner={resp.planner} />
          </div>
          <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, marginBottom: 11 }}>{resp.plan?.summary}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {(resp.plan?.steps ?? []).map((s, i) => <ToolCallCard key={i} step={s} index={i} result={resp.results?.[i]} />)}
          </div>
          <ResultBanner resp={resp} />
        </div>
      )}
    </div>
  );
}
