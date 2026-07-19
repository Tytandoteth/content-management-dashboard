/**
 * End-to-end carousel smoke — drives the real pipeline against the dev DB
 * without a running server: compose → render → createContent(draft) →
 * approve → export staging bundle. Run from the control-plane dir so cwd-based
 * paths (public/carousels, output/tiktok) resolve:
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/smoke-carousel.mts
 */
import { stat } from "node:fs/promises";
import { runGeneration } from "../src/lib/generation-service.js";
import { recordTransition } from "../src/lib/content-service.js";
import { exportStaging } from "../src/lib/publish/staging-exporter.js";
import { prisma } from "@cmd/db";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures += 1;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Carousel pipeline smoke (composer → render → approve → stage)\n");

  console.log("Generate:");
  const out = await runGeneration(
    { type: "carousel", brandSurface: "default", prompt: "Fireflies.ai note-taker", count: 4 },
    { createdBy: "smoke" },
  );
  check(`routed to the carousel composer (got "${out.engine}")`, out.engine === "carousel_composer");
  const item = out.items[0];
  check("created one draft content item", out.items.length === 1 && !!item);
  if (!item) return finish();
  const assets = Array.isArray(item.assetUrls) ? (item.assetUrls as string[]) : [];
  check(`item has 4 slide assets (got ${assets.length})`, assets.length === 4);
  check("item is a draft carousel", item.status === "draft" && item.type === "carousel");
  check("slide URLs are served from /carousels/", assets.every((u) => u.startsWith("/carousels/")));

  console.log("\nApproval gate (draft → in_review → approved):");
  await recordTransition({ contentItemId: item.id, to: "in_review", actor: "smoke" });
  const approved = await recordTransition({ contentItemId: item.id, to: "approved", actor: "smoke" });
  check("item is approved", approved.status === "approved");

  console.log("\nStaging export:");
  const bundle = await exportStaging(approved);
  check(`exported 4 slide PNGs (got ${bundle.slideCount})`, bundle.slideCount === 4);
  check("caption.txt written", await exists(bundle.captionPath));
  check("every staged slide file exists", (await Promise.all(bundle.files.map(exists))).every(Boolean));
  console.log(`  → bundle at ${bundle.dir}`);

  finish();
}

function finish() {
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  void prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke crashed:", err);
  process.exit(1);
});
