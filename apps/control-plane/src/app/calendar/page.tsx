import Link from "next/link";
import { prisma, type ContentItem } from "@cmd/db";
import { Pane, StatusPill } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CONTENT_TYPE_GLYPH } from "@/lib/design";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let items: ContentItem[] = [];
  try {
    items = await prisma.contentItem.findMany({ where: { status: { in: ["scheduled", "published"] } }, orderBy: { scheduledAt: "asc" }, take: 60 });
  } catch { /* db down */ }
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <Pane label="04" title="Calendar" pad={false}
        action={<span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{items.length} scheduled / published</span>}>
        {items.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: "var(--t-sm)", color: "var(--muted)" }}>Nothing on the calendar yet. Approve content to schedule it.</div>
        ) : items.map((it) => {
          const c = it.status === "published" ? "var(--st-published)" : "var(--st-scheduled)";
          return (
            <Link key={it.id} href={`/content/${it.id}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", borderLeft: `2px solid ${c}` }}>
              <span style={{ color: c }}><Icon name={CONTENT_TYPE_GLYPH[it.type]?.glyph} size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t-base)", color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
              <span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>{it.scheduledAt ? new Date(it.scheduledAt).toLocaleString() : "—"}</span>
              <StatusPill status={it.status} size="sm" />
            </Link>
          );
        })}
      </Pane>
    </div>
  );
}
