/**
 * Backfill Instagram (4:5, 1080×1350) slide renders for existing carousels from
 * their stored spec, so they can publish to IG in the right format. Stores the
 * IG slide URLs at payload.generationMetadata.instagram. Idempotent.
 *
 *   DATABASE_URL=... pnpm dlx tsx scripts/render-instagram.mts [ids…]
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@cmd/db";
import { renderAndStore } from "../src/lib/carousel/store.js";

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const items = await prisma.contentItem.findMany({
    where: { type: "carousel", ...(only.length ? { id: { in: only } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Rendering Instagram (4:5) variants for ${items.length} carousel(s)…\n`);
  let done = 0;
  let skipped = 0;

  for (const item of items) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const spec = meta.spec as { slides?: unknown[] } | undefined;
    if (!spec || !Array.isArray(spec.slides) || spec.slides.length === 0) {
      console.log(`  – ${item.id}: no stored spec, skipping`);
      skipped++;
      continue;
    }
    const folderId = (typeof meta.folderId === "string" && meta.folderId) || randomUUID().slice(0, 8);
    const igStored = await renderAndStore(`${folderId}-ig`, spec as never, { format: "instagram" });
    const newMeta = { ...meta, folderId, instagram: igStored.files };
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { payload: { ...payload, generationMetadata: newMeta } as never },
    });
    done++;
    console.log(`  ✓ ${item.id} (${item.status}) → ${igStored.files.length} IG slides`);
  }

  console.log(`\nDone: ${done} rendered, ${skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("IG render failed:", err);
  process.exit(1);
});
