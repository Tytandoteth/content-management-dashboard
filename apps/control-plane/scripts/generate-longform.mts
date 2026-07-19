/**
 * Backfill long-form resource-site articles for existing carousels from their
 * stored spec. Idempotent: skips items that already have one unless an id is
 * passed explicitly with --force.
 *
 *   DATABASE_URL=... pnpm dlx tsx scripts/generate-longform.mts [ids…] [--force]
 */
import { prisma } from "@cmd/db";
import { generateLongformArticle } from "../src/lib/longform.js";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("-"));

  const items = await prisma.contentItem.findMany({
    where: { type: "carousel", ...(only.length ? { id: { in: only } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Generating long-form articles for ${items.length} carousel(s)…\n`);
  let done = 0;
  let skipped = 0;

  for (const item of items) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const spec = meta.spec as { slides?: unknown[]; caption?: string } | undefined;
    if (!spec || !Array.isArray(spec.slides) || spec.slides.length === 0) {
      console.log(`  – ${item.id}: no stored spec, skipping`);
      skipped++;
      continue;
    }
    if (meta.longform && !force) {
      console.log(`  – ${item.id}: already has a longform article, skipping (--force to regenerate)`);
      skipped++;
      continue;
    }
    const longform = await generateLongformArticle(spec as never);
    const newMeta = { ...meta, longform };
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { payload: { ...payload, generationMetadata: newMeta } as never },
    });
    done++;
    console.log(`  ✓ ${item.id} (${item.status}) → "${longform.title}" (${longform.sections.length} sections)`);
  }

  console.log(`\nDone: ${done} generated, ${skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("longform generation failed:", err);
  process.exit(1);
});
