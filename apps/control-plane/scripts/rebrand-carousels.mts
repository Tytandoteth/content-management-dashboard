/**
 * Re-render every existing carousel with the CURRENT branding (palette, logo
 * mark, TikTok safe zones) from its stored spec — no LLM re-call. Trims captions
 * to 5 hashtags, updates assetUrls, and re-exports the staging bundle for any
 * approved/scheduled/published item so the whole funnel is consistent.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/rebrand-carousels.mts
 */
import { randomUUID } from "node:crypto";
import type { CarouselStyle } from "@cmd/carousel-render";
import { prisma } from "@cmd/db";
import { renderAndStore } from "../src/lib/carousel/store.js";
import { exportStaging } from "../src/lib/publish/staging-exporter.js";

async function main() {
  const items = await prisma.contentItem.findMany({ where: { type: "carousel" }, orderBy: { createdAt: "asc" } });
  console.log(`Re-rendering ${items.length} carousel(s) with current branding…\n`);

  let rerendered = 0;
  let skipped = 0;
  let restaged = 0;

  for (const item of items) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const spec = meta.spec as { slides?: unknown[]; caption?: string; hashtags?: unknown } | undefined;

    if (!spec || !Array.isArray(spec.slides) || spec.slides.length === 0) {
      console.log(`  – skip ${item.id} (${item.status}) — no stored spec`);
      skipped++;
      continue;
    }

    // Preserve the deck's chosen visual style across re-renders.
    const style = (meta.style as CarouselStyle | undefined) ?? "editorial";
    const folderId = randomUUID().slice(0, 8);
    const stored = await renderAndStore(folderId, spec as never, { style });

    const hashtags = Array.isArray(spec.hashtags)
      ? (spec.hashtags as unknown[]).filter((h): h is string => typeof h === "string").slice(0, 5)
      : [];
    const caption = [spec.caption, hashtags.join(" ")].filter(Boolean).join("\n\n");

    const newPayload = {
      ...payload,
      content: caption,
      generationMetadata: { ...meta, folderId, dir: stored.dir, spec: { ...spec, hashtags } },
    };

    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: { assetUrls: stored.files as never, payload: newPayload as never },
    });
    rerendered++;
    console.log(`  ✓ ${item.id} (${item.status}) → ${stored.files.length} slides`);

    if (["approved", "scheduled", "published"].includes(item.status)) {
      await exportStaging(updated);
      restaged++;
    }
  }

  console.log(`\nDone: ${rerendered} re-rendered, ${skipped} skipped, ${restaged} re-staged.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Rebrand failed:", err);
  process.exit(1);
});
