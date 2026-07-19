import { buildRegistry } from "@/lib/generators/registry";
import { EngineHealthChip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CONTENT_TYPE_GLYPH } from "@/lib/design";

export const dynamic = "force-dynamic";

export default async function EnginesPage() {
  const registry = buildRegistry();
  const engines = await Promise.all(
    registry.list().map(async (g) => ({
      name: g.name, engine: g.engine, supports: g.supports, manual: g.manual ?? false,
      health: await g.healthcheck().catch(() => "down" as const),
    })),
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Generation engines</h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-md)", color: "var(--muted)" }}>Every engine sits behind one adapter contract. Routing is health-aware — a down engine is skipped, not fatal.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {engines.map((e) => {
          const down = e.health === "down";
          return (
            <div key={e.name} style={{ background: "var(--ink-800)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: 15, display: "flex", flexDirection: "column", gap: 11, filter: down ? "saturate(0.5)" : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "var(--r-md)", display: "grid", placeItems: "center", background: "var(--ink-700)", border: "1px solid var(--line)", color: down ? "var(--muted)" : "var(--teal)" }}>
                    <Icon name="cpu" size={18} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--fg)" }}>{e.name}</span>
                      {e.manual && <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--st-scheduled)", border: "1px solid color-mix(in oklab, var(--st-scheduled) 34%, transparent)", padding: "1px 5px", borderRadius: "var(--r-sm)" }}>manual lane</span>}
                    </div>
                    <div className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)", marginTop: 3 }}>{e.engine}</div>
                  </div>
                </div>
                <EngineHealthChip health={e.health} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {e.supports.map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--fg-dim)", background: "var(--ink-700)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "2px 7px" }}>
                    <Icon name={CONTENT_TYPE_GLYPH[t]?.glyph} size={11} />{CONTENT_TYPE_GLYPH[t]?.label ?? t}
                  </span>
                ))}
              </div>
              {down && <div style={{ fontSize: "var(--t-xs)", color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="refresh" size={12} />routing skips this engine</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
