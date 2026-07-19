import Link from "next/link";
import { CONTENT_STATUSES, type ContentStatus } from "@cmd/contracts";
import { BRAND_IDENTITY } from "@cmd/brand";
import { prisma, type ContentItem } from "@cmd/db";
import { env } from "@/lib/env";
import { CONTENT_TYPE_GLYPH } from "@/lib/design";
import { Icon } from "@/components/Icon";
import { Pane, StatusPill, HeroStat } from "@/components/ui";
import { LifecyclePipeline } from "@/components/Pipeline";
import { ApprovalInbox, type InboxItem } from "@/components/ApprovalInbox";
import { ChatAsk } from "@/components/ChatAsk";
import { RecipeList } from "@/components/RecipeList";

export const dynamic = "force-dynamic";

async function loadDashboard() {
  const counts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  try {
    const grouped = await prisma.contentItem.groupBy({ by: ["status"], _count: { _all: true } });
    for (const row of grouped) counts[row.status as ContentStatus] = row._count._all;

    const [inReview, calendar, ready, recipes] = await Promise.all([
      prisma.contentItem.findMany({ where: { status: "in_review" }, orderBy: { createdAt: "asc" }, take: 6 }),
      prisma.contentItem.findMany({ where: { status: { in: ["scheduled", "published"] } }, orderBy: { scheduledAt: "asc" }, take: 6 }),
      prisma.contentItem.findMany({ where: { status: "approved" }, orderBy: { updatedAt: "desc" }, take: 6 }),
      prisma.recipe.findMany({ orderBy: { name: "asc" }, take: 4 }),
    ]);
    return { counts, inReview, calendar, ready, recipes, dbError: null as string | null };
  } catch (err) {
    return {
      counts,
      inReview: [] as ContentItem[],
      calendar: [] as ContentItem[],
      ready: [] as ContentItem[],
      recipes: [] as { slug: string; name: string; description: string | null }[],
      dbError: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function Dashboard() {
  const { counts, inReview, calendar, ready, recipes, dbError } = await loadDashboard();

  const inboxItems: InboxItem[] = inReview.map((i) => {
    const payload = (i.payload ?? {}) as Record<string, unknown>;
    return {
      id: i.id, title: i.title, type: i.type, brandSurface: i.brandSurface, createdBy: i.createdBy, assetUrls: i.assetUrls,
      paid: payload.paid === true,
      utm: typeof payload.content === "string" && payload.content.includes("utm_"),
    };
  });

  const inFlight = counts.idea + counts.draft + counts.in_review + counts.approved + counts.scheduled;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
      {dbError && (
        <Pane><div style={{ color: "var(--warn)", fontSize: "var(--t-sm)" }}>Control-plane DB not reachable. Run <code className="mono">pnpm db:up &amp;&amp; pnpm db:migrate</code>. ({dbError})</div></Pane>
      )}

      {/* hero pipeline */}
      <Pane style={{ background: "linear-gradient(180deg, var(--ink-800), var(--ink-850))" }} pad={false} accent="var(--teal)">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 4px", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="label" style={{ color: "var(--teal)" }}>Carousel pipeline</span>
              <span style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>live · {BRAND_IDENTITY.handle}</span>
            </div>
            <h2 style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: "var(--t-lg)", fontWeight: 600, letterSpacing: "-0.01em" }}>Money &amp; time-saving AI carousels. You approve, then post.</h2>
          </div>
          <div style={{ display: "flex", gap: 22, textAlign: "right" }}>
            <HeroStat label="In flight" value={inFlight} color="var(--fg)" />
            <HeroStat label="Awaiting you" value={counts.in_review} color="var(--st-review)" />
            <HeroStat label="Ready to post" value={counts.approved} color="var(--teal-bright)" />
            <HeroStat label="Posted" value={counts.published + counts.measured} color="var(--teal)" />
          </div>
        </div>
        <div style={{ padding: "6px 18px 16px" }}>
          <LifecyclePipeline counts={counts} />
        </div>
      </Pane>

      {/* two-column body */}
      <div className="se-dash">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Pane label="01" title="New carousel" accent="var(--teal)"
            action={
              env.openrouterApiKey() ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-xs)", color: "var(--teal)", fontFamily: "var(--font-mono)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 6px var(--teal)" }} />
                  {env.orchestratorModel()}
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-xs)", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)" }} />
                  heuristic planner
                </span>
              )
            }>
            <div style={{ marginBottom: 10, fontSize: "var(--t-sm)", color: "var(--muted)" }}>
              Ask for a carousel (&ldquo;make one on Fireflies&rdquo;), or paste trending terms in <Link href="/topics" style={{ color: "var(--teal)", textDecoration: "none" }}>Topics</Link>.
            </div>
            <ChatAsk />
          </Pane>
          <Pane label="02" title="Approval inbox" accent="var(--st-review)" pad={false}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderBottom: "1px solid var(--line)", background: "var(--ink-850)" }}>
              <span style={{ color: "var(--st-review)" }}><Icon name="eye" size={14} /></span>
              <span style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)" }}>
                <b className="tnum" style={{ color: "var(--fg)" }}>{counts.in_review}</b> carousel{counts.in_review === 1 ? "" : "s"} need a human — the only mandatory daily action.
              </span>
              {counts.in_review > 6 && <Link href="/approval" style={{ marginLeft: "auto", fontSize: "var(--t-xs)", color: "var(--teal)", textDecoration: "none" }}>View all →</Link>}
            </div>
            <ApprovalInbox items={inboxItems} />
          </Pane>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Pane label="03" title="Ready to post" accent="var(--teal-bright)" pad={false}
            action={<Link href="/staged" style={{ fontSize: "var(--t-xs)", color: "var(--muted)", textDecoration: "none" }}>All →</Link>}>
            {ready.length === 0 ? (
              <div style={{ padding: "20px 16px", fontSize: "var(--t-sm)", color: "var(--muted)" }}>Approved carousels land here — download the slides + caption and post.</div>
            ) : (
              <div>
                {ready.map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--teal)" }}><Icon name={CONTENT_TYPE_GLYPH[it.type]?.glyph} size={15} /></span>
                    <Link href={`/content/${it.id}`} style={{ flex: 1, minWidth: 0, fontSize: "var(--t-sm)", color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>{it.title}</Link>
                    <a href={`/api/content/${it.id}/download`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--t-xs)", color: "var(--teal)", textDecoration: "none" }}>
                      <Icon name="arrowRight" size={13} /> .zip
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Pane>

          <Pane label="04" title="Calendar" pad={false} action={<Link href="/calendar" style={{ fontSize: "var(--t-xs)", color: "var(--muted)", textDecoration: "none" }}>Full →</Link>}>
            {calendar.length === 0 ? (
              <div style={{ padding: "20px 16px", fontSize: "var(--t-sm)", color: "var(--muted)" }}>Scheduled &amp; posted carousels appear here.</div>
            ) : (
              <div>
                {calendar.map((it) => {
                  const s = STATUS_COLOR(it.status);
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ color: s }}><Icon name={CONTENT_TYPE_GLYPH[it.type]?.glyph} size={15} /></span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t-sm)", color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                      <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{it.scheduledAt ? new Date(it.scheduledAt).toLocaleDateString() : "—"}</span>
                      <StatusPill status={it.status} size="sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </Pane>

          <Pane label="05" title="Recipes" pad={false} action={<Link href="/recipes" style={{ fontSize: "var(--t-xs)", color: "var(--muted)", textDecoration: "none" }}>Manage →</Link>}>
            <RecipeList recipes={recipes.map((r) => ({ slug: r.slug, name: r.name, description: r.description }))} />
          </Pane>
        </div>
      </div>
    </div>
  );
}

function STATUS_COLOR(status: string): string {
  return status === "published" ? "var(--st-published)" : status === "scheduled" ? "var(--st-scheduled)" : "var(--muted)";
}
