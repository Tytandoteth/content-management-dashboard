import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND_IDENTITY } from "@cmd/brand";
import { findArticle, resourcesFromSpec, stepsFromSpec } from "@/lib/article";

export const dynamic = "force-dynamic";

/**
 * Public resource article for a carousel post. A viewer who saw the post can
 * search the tool/topic and land here — every tool with a clickable link, plus
 * the step-by-step. Renders from the carousel's stored spec, always in sync.
 */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await findArticle(slug);
  if (!article) notFound();

  const { spec, title } = article;
  const hook = spec.slides[0];
  const resources = resourcesFromSpec(spec);
  const steps = stepsFromSpec(spec);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-950)", color: "var(--fg)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 22px 80px" }}>
        {/* brand bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <Link href="/r" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={30} height={30} style={{ borderRadius: 8, display: "block" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>{BRAND_IDENTITY.displayName}</span>
          </Link>
          <Link href="/r" style={{ fontSize: "var(--t-sm)", color: "var(--teal)", textDecoration: "none" }}>All resources →</Link>
        </div>

        <article>
          <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: 2, color: "var(--teal)", fontWeight: 700, marginBottom: 10 }}>Resources &amp; links</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-3xl)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.08, margin: "0 0 14px" }}>{title}</h1>
          {hook?.body && <p style={{ fontSize: "var(--t-lg)", color: "var(--fg-dim)", lineHeight: 1.5, margin: "0 0 8px" }}>{hook.body}</p>}

          {/* Tools & where to get them */}
          {resources.length > 0 && (
            <section style={{ marginTop: 36 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-xl)", fontWeight: 700, margin: "0 0 14px" }}>The tools &amp; where to get them</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {resources.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--ink-900)" }}>
                    {r.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo} alt="" width={40} height={40} style={{ borderRadius: 10, background: "#fff", padding: 5, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{r.name}</div>
                      {r.blurb && <div style={{ fontSize: "var(--t-sm)", color: "var(--muted)", marginTop: 2 }}>{r.blurb}</div>}
                    </div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, fontSize: "var(--t-sm)", fontWeight: 600, color: "#fff", background: "var(--teal)", padding: "8px 14px", borderRadius: 999, textDecoration: "none" }}>
                        Get it →
                      </a>
                    ) : (
                      <span style={{ flexShrink: 0, fontSize: "var(--t-xs)", color: "var(--muted)" }}>search it</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Step by step */}
          {steps.length > 0 && (
            <section style={{ marginTop: 40 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-xl)", fontWeight: 700, margin: "0 0 16px" }}>Step by step</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "linear-gradient(150deg,#ff9a3d,#e2541b)", fontFamily: "var(--font-display)", fontWeight: 800, color: "#fff", fontSize: 15 }}>{i + 1}</span>
                    <div>
                      {s.kicker && <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: 1.5, color: "var(--teal)", fontWeight: 700, marginBottom: 3 }}>{s.kicker}</div>}
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)", fontWeight: 600 }}>{s.headline}</div>
                      {s.body && <p style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", lineHeight: 1.55, margin: "5px 0 0" }}>{s.body}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <section style={{ marginTop: 44, padding: "22px 20px", border: "1px solid var(--line)", borderRadius: "var(--r-xl)", background: "linear-gradient(120deg, rgba(255,122,26,0.10), rgba(230,210,181,0.05))" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-lg)", fontWeight: 700 }}>Want more like this?</div>
            <p style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)", margin: "6px 0 14px" }}>Follow {BRAND_IDENTITY.handle} for money &amp; time-saving AI, and grab every resource in one place.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={BRAND_IDENTITY.tiktokUrl} target="_blank" rel="noreferrer" style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "#fff", background: "var(--teal)", padding: "10px 18px", borderRadius: 999, textDecoration: "none" }}>Follow on TikTok</a>
              <a href={BRAND_IDENTITY.ctaUrl} target="_blank" rel="noreferrer" style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--fg)", border: "1px solid var(--line-strong)", padding: "10px 18px", borderRadius: 999, textDecoration: "none" }}>All my resources</a>
            </div>
          </section>

          {spec.hashtags?.length > 0 && (
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {spec.hashtags.map((h, i) => (
                <span key={i} style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{h}</span>
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
