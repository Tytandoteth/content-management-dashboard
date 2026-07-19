"use client";

import { Icon } from "./Icon";
import { CONTENT_TYPE_GLYPH } from "@/lib/design";

/**
 * Renders the REAL asset for a content item — video player for video URLs,
 * <img> for images, and the brand gradient+glyph only as the no-asset fallback.
 */
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
// Accept absolute http(s) URLs and root-relative paths (e.g. /carousels/<id>/slide-01.png).
const ASSET_RE = /^(https?:\/\/|\/)/;

export function firstAsset(assetUrls: unknown): string | null {
  if (!Array.isArray(assetUrls)) return null;
  const url = assetUrls.find((u) => typeof u === "string" && ASSET_RE.test(u));
  return (url as string) ?? null;
}

/** Every usable image asset, in order — used to preview carousels. */
export function imageAssets(assetUrls: unknown): string[] {
  if (!Array.isArray(assetUrls)) return [];
  return assetUrls.filter(
    (u): u is string => typeof u === "string" && ASSET_RE.test(u) && IMAGE_RE.test(u),
  );
}

export function AssetPreview({
  assetUrls,
  type,
  brand,
  variant = "thumb",
  size = 52,
}: {
  assetUrls: unknown;
  type: string;
  brand: string;
  /** thumb = small square; card = 16:10 fill-width; full = player in detail. */
  variant?: "thumb" | "card" | "full";
  /** thumb size in px (square). Ignored for card/full. */
  size?: number;
}) {
  const url = firstAsset(assetUrls);
  // Decorative-only fallback accent for the no-asset branded placeholder. This
  // fork ships a single brand surface, so it's a fixed brand-orange hue rather
  // than a per-brand lookup; `brand` stays in the signature for API stability.
  void brand;
  const accent = "var(--teal)";
  const hue = 26;

  const frame: React.CSSProperties =
    variant === "thumb"
      ? { width: size, height: size, borderRadius: "var(--r-md)", overflow: "hidden", flexShrink: 0, border: "1px solid var(--line)", position: "relative", background: "var(--ink-900)" }
      : variant === "card"
        ? { width: "100%", aspectRatio: "16/10", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--line)", position: "relative", background: "var(--ink-900)" }
        : { width: "min(300px, 38vw)", aspectRatio: "9/16", borderRadius: "var(--r-lg)", overflow: "hidden", flexShrink: 0, border: "1px solid var(--line)", position: "relative", background: "var(--ink-900)" };

  if (url && VIDEO_RE.test(url)) {
    return (
      <div style={frame}>
        {variant === "full" ? (
          <video src={url} controls playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <>
            <video src={url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
              <Icon name="play" size={variant === "card" ? 24 : Math.max(14, size / 3.2)} />
            </span>
          </>
        )}
      </div>
    );
  }

  if (url && IMAGE_RE.test(url)) {
    return (
      <div style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }

  // No real asset (text posts/threads) — branded fallback, honestly decorative.
  return (
    <div style={{ ...frame, background: `radial-gradient(120% 100% at 70% 0%, hsl(${hue} 52% 18%), hsl(${hue} 58% 8%))` }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "var(--grid)", backgroundSize: "12px 12px", opacity: 0.4 }} />
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: accent }}>
        <Icon name={CONTENT_TYPE_GLYPH[type]?.glyph} size={variant === "full" ? 34 : Math.max(14, size / 2.6)} />
      </div>
    </div>
  );
}
