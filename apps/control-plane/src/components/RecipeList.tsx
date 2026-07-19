"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Btn, EmptyState } from "./ui";

export interface RecipeRow {
  slug: string;
  name: string;
  description: string | null;
}

export function RecipeList({ recipes }: { recipes: RecipeRow[] }) {
  if (recipes.length === 0) {
    return <div style={{ padding: 16 }}><EmptyState icon="recipes" title="No recipes yet" hint="Seed the starter workflows to one-click your content." /></div>;
  }
  return <div>{recipes.map((r, i) => <Row key={r.slug} recipe={r} index={i} />)}</div>;
}

function Row({ recipe }: { recipe: RecipeRow; index: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null); setBusy(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.slug}/run`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { count?: number; error?: string };
      if (!res.ok) { setMsg(d.error ?? `Failed (${res.status})`); return; }
      setMsg(`Queued ${d.count} draft(s) → approval`);
      startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", gap: 13, padding: "14px 16px", borderBottom: "1px solid var(--line)", background: hover ? "var(--ink-750)" : "transparent", transition: "background var(--dur-fast)" }}>
      <div style={{ width: 38, height: 38, borderRadius: "var(--r-md)", flexShrink: 0, display: "grid", placeItems: "center", background: "var(--teal-dim)", color: "var(--teal)", border: "1px solid var(--line-teal)" }}>
        <Icon name="recipes" size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)" }}>{recipe.name}</div>
        {recipe.description && <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{recipe.description}</div>}
        {msg && <div style={{ fontSize: "var(--t-xs)", color: "var(--teal)", marginTop: 6 }}>{msg}</div>}
      </div>
      <Btn kind="solid" size="sm" icon="play" disabled={busy} onClick={run}>Run</Btn>
    </div>
  );
}
