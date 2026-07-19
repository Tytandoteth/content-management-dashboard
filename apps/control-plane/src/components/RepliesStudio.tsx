"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Pane, Btn, EmptyState, ErrorState } from "./ui";

interface Video {
  id: string;
  title: string;
  slug: string;
  status: string;
  articleUrl: string;
  pinned: string;
}
interface Reply {
  id: string;
  contentItemId: string;
  contentTitle: string | null;
  platform: string;
  comment: string;
  commenter: string | null;
  draftReply: string;
  status: string;
  sentVia: string | null;
}

const STATUSES = ["drafted", "approved", "sent", "dismissed"] as const;

export function RepliesStudio() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("drafted");
  const [loading, setLoading] = useState(true);

  // Draft panel.
  const [videoId, setVideoId] = useState("");
  const [comment, setComment] = useState("");
  const [commenter, setCommenter] = useState("");
  const [batch, setBatch] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);

  // Per-reply local edits + transient "copied" flashes.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);

  const selectedVideo = videos.find((v) => v.id === videoId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/replies${statusFilter ? `?status=${statusFilter}` : ""}`);
      const d = await res.json();
      setReplies(d.replies ?? []);
      setVideos(d.videos ?? []);
      if (!videoId && d.videos?.[0]) setVideoId(d.videos[0].id);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, videoId]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    if (drafting || !videoId || !comment.trim()) return;
    setDrafting(true);
    setDraftErr(null);
    try {
      if (batch) {
        const comments = comment.split("\n").map((l) => l.trim()).filter(Boolean);
        const res = await fetch("/api/replies/draft-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contentItemId: videoId, comments }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      } else {
        const res = await fetch("/api/replies/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contentItemId: videoId, comment, commenter }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setComment("");
      setCommenter("");
      setStatusFilter("drafted");
      await load();
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  const copyPin = async () => {
    if (!selectedVideo) return;
    try {
      await navigator.clipboard.writeText(selectedVideo.pinned);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const act = async (r: Reply, action: "approve" | "send" | "dismiss") => {
    const editedText = edits[r.id];
    const res = await fetch(`/api/replies/${r.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, editedText }),
    });
    const d = await res.json();
    if (action === "send" && d.send?.text) {
      try {
        await navigator.clipboard.writeText(d.send.text);
        setCopied(r.id);
        setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 1800);
      } catch {
        /* clipboard may be blocked; the text is still saved on the reply */
      }
    }
    await load();
  };

  const inputStyle = {
    background: "var(--ink-900)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-md)",
    color: "var(--fg)",
    padding: "9px 11px",
    fontSize: "var(--t-base)",
    fontFamily: "var(--font-body)",
    outline: "none",
    width: "100%",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
      {/* DRAFT A REPLY */}
      <Pane
        title="Draft a reply"
        accent="var(--teal)"
        label="COMMENT → REPLY"
        action={
          <Btn kind="primary" icon="sparkles" onClick={generate} disabled={drafting || !videoId || !comment.trim()}>
            {drafting ? "Drafting…" : "Generate reply"}
          </Btn>
        }
      >
        <p style={{ color: "var(--fg-dim)", fontSize: "var(--t-sm)", margin: "0 0 14px" }}>
          Paste a comment from one of your videos. We draft a short, on-brand reply that answers it and links the post&apos;s free resource guide. You review before it&apos;s sent.
        </p>
        {videos.length === 0 ? (
          <EmptyState icon="post" title="No published videos yet" hint="Publish a carousel first — then you can reply to its comments here." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t-xs)", color: "var(--muted)", flex: "2 1 320px" }}>
                VIDEO
                <select value={videoId} onChange={(e) => setVideoId(e.target.value)} style={inputStyle}>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} ({v.status})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t-xs)", color: "var(--muted)", flex: "1 1 140px" }}>
                COMMENTER (optional)
                <input value={commenter} onChange={(e) => setCommenter(e.target.value)} placeholder="@username" style={inputStyle} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t-xs)", color: "var(--muted)" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {batch ? "COMMENTS (one per line)" : "COMMENT"}
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--fg-dim)", textTransform: "none" }}>
                  <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} style={{ accentColor: "var(--teal)" }} />
                  Batch (paste many)
                </label>
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={batch ? "Paste comments, one per line — we draft a reply for each" : "e.g. what was the first tool again?"}
                rows={batch ? 6 : 2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            {draftErr && <ErrorState title="Could not draft" reasons={[draftErr]} />}

            {selectedVideo && (
              <div style={{ padding: 12, background: "var(--ink-900)", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-md)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: "var(--t-xs)", color: "var(--teal)", fontWeight: 600 }}>📌 Pin this comment on the post</span>
                  <Btn kind="ghost" size="sm" icon={pinCopied ? "check" : "post"} onClick={copyPin}>
                    {pinCopied ? "Copied!" : "Copy"}
                  </Btn>
                </div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.45 }}>{selectedVideo.pinned}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                  Pinning one comment answers &quot;where do I get this?&quot; for everyone — free, once per post.
                </div>
              </div>
            )}
          </div>
        )}
      </Pane>

      {/* INBOX */}
      <Pane
        title="Replies"
        label={`${replies.length} ${statusFilter.toUpperCase()}`}
        action={
          <div style={{ display: "flex", gap: 4 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{ padding: "5px 11px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: statusFilter === s ? "var(--teal-dim)" : "transparent", color: statusFilter === s ? "var(--teal)" : "var(--fg-dim)", fontSize: "var(--t-xs)", cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "capitalize" }}
              >
                {s}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)", padding: 20 }}>Loading…</div>
        ) : replies.length === 0 ? (
          <EmptyState icon="thread" title={`No ${statusFilter} replies`} hint="Draft one above to get started." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {replies.map((r) => (
              <div key={r.id} style={{ background: "var(--ink-900)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--teal)", border: "1px solid var(--line-teal)", borderRadius: "var(--r-full)", padding: "2px 8px" }}>{r.platform}</span>
                  <span style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>on “{r.contentTitle ?? "—"}”</span>
                </div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", marginBottom: 10 }}>
                  <span style={{ color: "var(--muted)" }}>{r.commenter ? `${r.commenter}: ` : "Comment: "}</span>
                  {r.comment}
                </div>
                <textarea
                  defaultValue={r.draftReply}
                  onChange={(e) => setEdits((m) => ({ ...m, [r.id]: e.target.value }))}
                  rows={3}
                  disabled={r.status === "dismissed"}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.45 }}
                />
                {r.status === "sent" ? (
                  <div style={{ marginTop: 8, fontSize: "var(--t-xs)", color: "var(--ok)" }}>
                    ✓ Sent {r.sentVia === "manual_copy" ? "(copied — paste it on the post)" : `via ${r.sentVia}`}
                  </div>
                ) : r.status === "dismissed" ? (
                  <div style={{ marginTop: 8, fontSize: "var(--t-xs)", color: "var(--muted)" }}>Dismissed</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Btn kind="primary" icon={copied === r.id ? "check" : "post"} size="sm" onClick={() => act(r, "send")}>
                      {copied === r.id ? "Copied!" : "Copy & mark sent"}
                    </Btn>
                    {r.status === "drafted" && (
                      <Btn kind="solid" icon="check" size="sm" onClick={() => act(r, "approve")}>
                        Approve
                      </Btn>
                    )}
                    <Btn kind="ghost" icon="ban" size="sm" onClick={() => act(r, "dismiss")}>
                      Dismiss
                    </Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Pane>
    </div>
  );
}
