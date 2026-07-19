"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { CarouselPreview } from "./CarouselPreview";
import { imageAssets } from "./AssetPreview";

/**
 * "Ready to post" — approved carousels with their rendered slides and caption,
 * each exported as a bundle under output/tiktok/<id>/. Until TikTok photo-post
 * auto-publish is wired, this is the hand-off surface: review, copy the caption,
 * grab the slides, post in the TikTok app.
 */
interface Item {
  id: string;
  title: string;
  type: string;
  status: string;
  brandSurface: string;
  assetUrls?: unknown;
  payload?: Record<string, unknown>;
}

interface TikTokStatus {
  configured: boolean;
  connected: boolean;
  label: string | null;
  publicBaseUrlSet: boolean;
}

export function StagedView() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState<Record<string, { dir: string; slideCount: number }>>({});
  const [tiktok, setTiktok] = useState<TikTokStatus | null>(null);
  const [pushed, setPushed] = useState<Record<string, string>>({});
  const [pushErr, setPushErr] = useState<Record<string, string>>({});
  const [pushing, setPushing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/content?type=carousel&status=approved");
    const d = await res.json().catch(() => ({ items: [] }));
    setItems(d.items ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    void fetch("/api/tiktok/status")
      .then((r) => r.json())
      .then(setTiktok)
      .catch(() => setTiktok(null));
  }, [load]);

  const reExport = async (id: string) => {
    const res = await fetch(`/api/content/${id}/stage`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setStaged((s) => ({ ...s, [id]: { dir: d.dir, slideCount: d.slideCount } }));
  };

  const pushTikTok = async (id: string) => {
    setPushing(id);
    setPushErr((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/content/${id}/push-tiktok`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `failed (${res.status})`);
      setPushed((p) => ({ ...p, [id]: d.publishId }));
    } catch (e) {
      setPushErr((er) => ({ ...er, [id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPushing(null);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Ready to post</h1>
        <span className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--muted)" }}>{items.length} approved</span>
      </div>
      <p style={{ marginTop: 0, marginBottom: 18, color: "var(--muted)", fontSize: "var(--t-sm)", maxWidth: 640 }}>
        Approved carousels are exported to <code>output/tiktok/&lt;id&gt;/</code> (slides + <code>caption.txt</code>). Copy the
        caption, grab the slides, and post in the TikTok app.
      </p>

      {tiktok && (
        <div style={{ marginBottom: 18, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: "var(--t-sm)" }}>
          {!tiktok.configured ? (
            <span style={{ color: "var(--muted)" }}>
              TikTok auto-posting isn&apos;t configured — set <code>TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI</code> and{" "}
              <code>PUBLIC_BASE_URL</code> (see <code>docs/tiktok-auto-post.md</code>).
            </span>
          ) : !tiktok.connected ? (
            <>
              <span style={{ color: "var(--fg-dim)" }}>Push approved carousels straight to your TikTok drafts.</span>
              <a href="/api/tiktok/auth" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: "var(--r-md)", background: "var(--teal)", color: "#fff", fontWeight: 600, textDecoration: "none" }}>
                <Icon name="send" size={14} /> Connect TikTok
              </a>
              {!tiktok.publicBaseUrlSet && (
                <span style={{ color: "var(--warn, #f5b13d)", fontSize: "var(--t-xs)" }}>
                  Note: set PUBLIC_BASE_URL — TikTok needs public image URLs.
                </span>
              )}
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--teal)" }}>
              <Icon name="check" size={14} /> TikTok connected{tiktok.label ? ` · ${tiktok.label}` : ""}
              {!tiktok.publicBaseUrlSet && (
                <span style={{ color: "var(--warn, #f5b13d)", marginLeft: 8, fontSize: "var(--t-xs)" }}>
                  (set PUBLIC_BASE_URL for the slide images)
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>
          No approved carousels yet. Generate one in the <Link href="/content" style={{ color: "var(--teal)" }}>Content</Link> tab and approve it.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => {
            const images = imageAssets(item.assetUrls);
            const caption = typeof item.payload?.content === "string" ? (item.payload.content as string) : item.title;
            const st = staged[item.id];
            return (
              <div key={item.id} style={{ display: "flex", gap: 16, padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--ink-900)", flexWrap: "wrap" }}>
                {images.length > 0 && <CarouselPreview images={images} />}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <Link href={`/content/${item.id}`} style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)", textDecoration: "none" }}>
                    {item.title}
                  </Link>
                  <p style={{ marginTop: 10, fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{caption}</p>
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigator.clipboard?.writeText(caption)}
                      style={btn}
                    >
                      <Icon name="link" size={14} /> Copy caption
                    </button>
                    <a href={`/api/content/${item.id}/download`} style={{ ...btn, textDecoration: "none" }}>
                      <Icon name="arrowRight" size={14} /> Download .zip
                    </a>
                    <button onClick={() => reExport(item.id)} style={btn}>
                      <Icon name="refresh" size={14} /> Re-export bundle
                    </button>
                    {tiktok?.connected && (
                      <button onClick={() => pushTikTok(item.id)} disabled={pushing === item.id} style={{ ...btn, borderColor: "var(--teal)", color: "var(--teal)" }}>
                        <Icon name="send" size={14} /> {pushing === item.id ? "Pushing…" : "Push to TikTok draft"}
                      </button>
                    )}
                    {st && (
                      <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                        {st.slideCount} slides → {st.dir}
                      </span>
                    )}
                    {pushed[item.id] && (
                      <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--teal)" }}>
                        sent to TikTok drafts ✓ ({pushed[item.id]})
                      </span>
                    )}
                    {pushErr[item.id] && (
                      <span style={{ fontSize: "var(--t-xs)", color: "var(--st-rejected, #ff6b6b)" }}>{pushErr[item.id]}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line-strong)",
  background: "transparent",
  color: "var(--fg)",
  fontSize: "var(--t-sm)",
  cursor: "pointer",
};
