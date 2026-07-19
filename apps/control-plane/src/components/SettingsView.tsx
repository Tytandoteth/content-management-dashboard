"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./Icon";
import { Pane } from "./ui";

interface Connections {
  config: { postiz: boolean; autoPublish: boolean; openrouter: boolean; orchestratorModel: string; higgsfield: boolean; tiktokDirect: boolean };
  channels: Array<Record<string, unknown>>;
}

function StatusRow({ label, on, detail }: { label: string; on: boolean; detail?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "var(--ok)" : "var(--faint)", boxShadow: on ? "0 0 6px var(--ok)" : "none" }} />
      <span style={{ fontSize: "var(--t-base)", color: "var(--fg)" }}>{label}</span>
      {detail && <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{detail}</span>}
      <span className="mono" style={{ marginLeft: "auto", fontSize: "var(--t-xs)", color: on ? "var(--ok)" : "var(--muted)" }}>{on ? "configured" : "not set"}</span>
    </div>
  );
}

// Reads ?tiktok=connected|error(&reason=...) left by /api/tiktok/callback and
// shows a dismissible banner. Dismissing also strips the params from the URL
// so a refresh doesn't bring the banner back.
function TikTokOAuthBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  const tiktok = searchParams.get("tiktok");
  const reason = searchParams.get("reason");
  if (dismissed || (tiktok !== "connected" && tiktok !== "error")) return null;

  const ok = tiktok === "connected";
  const color = ok ? "var(--ok)" : "var(--danger)";
  const dismiss = () => { setDismissed(true); router.replace("/settings"); };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--r-md)", border: `1px solid color-mix(in oklab, ${color} 36%, transparent)`, background: ok ? "var(--ok-bg)" : "var(--danger-bg)" }}>
      <span style={{ color, flexShrink: 0 }}><Icon name={ok ? "check" : "alert"} size={18} /></span>
      <span style={{ fontSize: "var(--t-base)", color: "var(--fg)", fontWeight: 500 }}>
        {ok ? "TikTok connected" : `TikTok connection failed${reason ? ` — ${reason}` : ""}`}
      </span>
      <button onClick={dismiss} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function SettingsView() {
  const [data, setData] = useState<Connections | null>(null);
  useEffect(() => { fetch("/api/connections").then((r) => r.json()).then(setData).catch(() => setData(null)); }, []);
  const c = data?.config;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <TikTokOAuthBanner />
      <Pane label="Integrations" title="What's wired">
        {!c ? <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>Loading…</div> : (
          <div>
            <StatusRow label="Publishing — Postiz" on={c.postiz} />
            <StatusRow label="Auto-publish (scheduler)" on={c.autoPublish} detail={c.autoPublish ? "posts approved carousels on schedule" : "off — publish manually"} />
            <StatusRow label="Copywriter — OpenRouter" on={c.openrouter} detail={c.orchestratorModel} />
            <StatusRow label="AI backgrounds — Higgsfield" on={c.higgsfield} />
            <StatusRow label="TikTok direct (draft API)" on={c.tiktokDirect} />
          </div>
        )}
        <p style={{ marginTop: 12, fontSize: "var(--t-xs)", color: "var(--muted)", lineHeight: 1.5 }}>
          Configured via environment variables. With Postiz connected you can publish a carousel to TikTok from its detail page
          (<b>Publish now</b>), or set <code className="mono">AUTO_PUBLISH=true</code> to let the scheduler post approved, scheduled
          carousels automatically. Secrets are never shown here.
        </p>
      </Pane>

      <Pane label="Channels" title="Connected accounts" action={<span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{data?.channels?.length ?? 0}</span>}>
        {!data?.channels?.length ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--t-sm)", color: "var(--muted)" }}>
            <Icon name="link" size={15} />
            {c?.postiz ? "No channels connected yet — connect them in the Postiz UI." : "Connect Postiz to manage channels (X, TikTok, Meta, LinkedIn, YouTube)."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.channels.map((ch, i) => {
              const picture = typeof ch.picture === "string" ? ch.picture : null;
              const identifier = String(ch.identifier ?? ch.providerIdentifier ?? "");
              const profile = typeof ch.profile === "string" && ch.profile ? `@${ch.profile}` : "";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={picture} alt="" width={28} height={28} style={{ borderRadius: "50%", border: "1px solid var(--line-strong)", objectFit: "cover" }} />
                  ) : (
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ink-700)", display: "grid", placeItems: "center" }}><Icon name="send" size={13} /></span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--t-sm)", color: "var(--fg)", fontWeight: 500 }}>{String(ch.name ?? ch.id ?? "channel")}</div>
                    <div className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{identifier}{profile ? ` · ${profile}` : ""}</div>
                  </div>
                  <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: ch.disabled ? "var(--faint)" : "var(--ok)", boxShadow: ch.disabled ? "none" : "0 0 6px var(--ok)" }} />
                </div>
              );
            })}
          </div>
        )}
      </Pane>
    </div>
  );
}
