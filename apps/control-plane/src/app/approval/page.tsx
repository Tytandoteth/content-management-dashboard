import { prisma } from "@cmd/db";
import { Pane } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ApprovalInbox, type InboxItem } from "@/components/ApprovalInbox";

export const dynamic = "force-dynamic";

export default async function ApprovalPage() {
  let items: InboxItem[] = [];
  try {
    const rows = await prisma.contentItem.findMany({ where: { status: "in_review" }, orderBy: { createdAt: "asc" }, take: 50 });
    items = rows.map((i) => {
      const p = (i.payload ?? {}) as Record<string, unknown>;
      return { id: i.id, title: i.title, type: i.type, brandSurface: i.brandSurface, createdBy: i.createdBy, paid: p.paid === true, utm: typeof p.content === "string" && p.content.includes("utm_"), assetUrls: i.assetUrls };
    });
  } catch { /* db down — show empty */ }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <Pane label="02" title="Approval inbox" accent="var(--st-review)" pad={false}
        action={<span className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>A approve · R reject</span>}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--ink-850)" }}>
          <span style={{ color: "var(--st-review)" }}><Icon name="eye" size={14} /></span>
          <span style={{ fontSize: "var(--t-sm)", color: "var(--fg-dim)" }}>
            <b className="tnum" style={{ color: "var(--fg)" }}>{items.length}</b> item{items.length === 1 ? "" : "s"} need a human — the only mandatory daily action.
          </span>
        </div>
        <ApprovalInbox items={items} bulk />
      </Pane>
    </div>
  );
}
