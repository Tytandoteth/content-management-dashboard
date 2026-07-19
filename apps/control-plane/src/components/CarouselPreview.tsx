"use client";

import { useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Swipeable preview of a carousel's slides — the multi-image equivalent of
 * AssetPreview's single <img>. A scroll-snap strip of 9:16 slides with
 * prev/next controls, a counter, and dots. Used in the item detail + approval.
 */
export function CarouselPreview({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  if (images.length === 0) return null;

  const go = (n: number) => {
    const next = Math.max(0, Math.min(images.length - 1, n));
    setIdx(next);
    const el = ref.current?.children[next] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setIdx(Math.round(el.scrollLeft / w));
  };

  return (
    <div style={{ width: "min(300px, 38vw)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          aspectRatio: "9/16",
          borderRadius: "var(--r-lg)",
          border: "1px solid var(--line)",
          background: "var(--ink-900)",
          scrollbarWidth: "none",
        }}
      >
        {images.map((src, i) => (
          <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "center", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Slide ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "#fff",
                background: "rgba(0,0,0,0.5)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {i + 1}/{images.length}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => go(idx - 1)} disabled={idx === 0} style={navBtn(idx === 0)} aria-label="Previous slide">
          <Icon name="chevronLeft" size={16} />
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: i === idx ? 18 : 7,
                height: 7,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                padding: 0,
                background: i === idx ? "var(--teal)" : "var(--line)",
                transition: "width 120ms ease",
              }}
            />
          ))}
        </div>
        <button onClick={() => go(idx + 1)} disabled={idx === images.length - 1} style={navBtn(idx === images.length - 1)} aria-label="Next slide">
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: "var(--r-md)",
    border: "1px solid var(--line)",
    background: "transparent",
    color: disabled ? "var(--muted)" : "var(--fg)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}
