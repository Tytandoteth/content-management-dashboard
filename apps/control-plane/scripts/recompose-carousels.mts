/**
 * Re-COMPOSE every existing carousel under the CURRENT brand voice (re-calls the
 * LLM, unlike rebrand-carousels.mts which only re-renders the stored spec). Use
 * after a voice/angle change (e.g. the money/save-money/save-time focus) so the
 * whole library follows it. Re-renders + re-stages approved items in place.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/recompose-carousels.mts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@cmd/db";
import { composeSpec } from "../src/lib/carousel/compose.js";
import { buildBackgroundProvider } from "../src/lib/carousel/background.js";
import { renderAndStore } from "../src/lib/carousel/store.js";
import { exportStaging } from "../src/lib/publish/staging-exporter.js";

async function main() {
  // Optional: pass content-item ids to re-compose only those (else all carousels).
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const items = await prisma.contentItem.findMany({
    where: { type: "carousel", ...(only.length ? { id: { in: only } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Re-composing ${items.length} carousel(s) under the current voice…\n`);
  let done = 0;
  let restaged = 0;

  for (const item of items) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const oldSpec = meta.spec as { slides?: unknown[]; topic?: string } | undefined;
    const topic = (typeof meta.topic === "string" && meta.topic) || item.title;
    const slideCount = Array.isArray(oldSpec?.slides) ? oldSpec!.slides!.length : 5;

    // Fresh copy under the new voice.
    const spec = await composeSpec(topic, { slideCount });

    const bg = buildBackgroundProvider();
    for (let i = 0; i < spec.slides.length; i++) {
      const url = await bg.backgroundFor(spec.slides[i]!, { index: i + 1, total: spec.slides.length, topic: spec.topic });
      if (url) spec.slides[i]!.bgImageUrl = url;
    }

    const folderId = randomUUID().slice(0, 8);
    const stored = await renderAndStore(folderId, spec);
    const caption = [spec.caption, spec.hashtags.join(" ")].filter(Boolean).join("\n\n");
    const newPayload = {
      ...payload,
      content: caption,
      generationMetadata: { ...meta, folderId, dir: stored.dir, topic: spec.topic, spec },
    };

    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: { title: (spec.topic ?? item.title).slice(0, 120), assetUrls: stored.files as never, payload: newPayload as never },
    });
    done++;
    console.log(`  ✓ ${item.id} (${item.status}) → "${spec.slides[0]?.headline ?? ""}"`);

    if (["approved", "scheduled", "published"].includes(item.status)) {
      await exportStaging(updated);
      restaged++;
    }
  }

  console.log(`\nDone: ${done} re-composed, ${restaged} re-staged.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Recompose failed:", err);
  process.exit(1);
});
