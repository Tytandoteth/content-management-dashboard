/**
 * Render X/Twitter (1:1) image variants for already-registered carousels, from
 * their STORED spec (no GitHub re-fetch), and repoint their X drafts' media at
 * the new square images. TikTok is 9:16 and Instagram 4:5 — X crops those in the
 * timeline, so threads/posts need 1:1 renders that preview cleanly.
 *
 *   cd apps/control-plane
 *   pnpm exec tsx scripts/render-x.mts <carouselItemId> [<itemId> ...]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCarousel, type CarouselSpec, type CarouselStyle } from "@cmd/carousel-render";
import { BRAND_IDENTITY } from "@cmd/brand";
import { prisma } from "@cmd/db";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error("usage: tsx scripts/render-x.mts <carouselItemId> ..."); process.exit(1); }

  // Load every X draft once so we can repoint the right ones by sourceItemId.
  const xDrafts = await prisma.contentItem.findMany({ where: { type: { in: ["thread", "tweet"] } } });

  for (const id of ids) {
    const item = await prisma.contentItem.findUnique({ where: { id } });
    if (!item) { console.warn(`  ⚠ ${id} not found`); continue; }
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.generationMetadata ?? {}) as Record<string, unknown>;
    const spec = meta.spec as CarouselSpec | undefined;
    if (!spec) { console.warn(`  ⚠ ${id} has no spec`); continue; }
    const style = (meta.style as CarouselStyle) ?? "editorial";
    const assets = Array.isArray(item.assetUrls) ? (item.assetUrls as string[]) : [];
    const folder = assets[0]?.match(/carousels\/([^/]+)\//)?.[1];
    if (!folder) { console.warn(`  ⚠ ${id} has no folder in assetUrls`); continue; }

    // The 1:1 square is shorter than 9:16 — drop tall extras (terminal panels)
    // so a card+terminal body slide doesn't overflow. The repo card alone fits,
    // and the thread copy already carries the install/run steps.
    const xSpec: CarouselSpec = { ...spec, slides: spec.slides.map((s) => { const { terminal, ...rest } = s as Record<string, unknown>; return rest as (typeof spec.slides)[number]; }) };
    // 2x the 1080 canvas → 2160x2160. TikTok caps photos at 1080p, but X accepts up
    // to 4096x4096 and downsamples, so shipping 1080 means X upscales it and the
    // type goes soft on retina. Same layout, twice the pixels.
    //
    // Branding is per-account: these images live on X, so they carry the
    // configured X handle (BRAND_IDENTITY.xHandle), NOT the TikTok handle. And a
    // thread doesn't swipe (each image is its own tweet), so the "Swipe »"
    // affordance is nonsense here.
    const rendered = await renderCarousel(xSpec, {
      style,
      format: "x",
      scale: 2,
      handle: BRAND_IDENTITY.xHandle,
      hideSwipeHint: true,
    });
    const outDir = join(process.cwd(), "public", "carousels", `${folder}-x`);
    await mkdir(outDir, { recursive: true });
    const files: string[] = [];
    for (const slide of rendered) {
      const name = `slide-${String(slide.index + 1).padStart(2, "0")}.jpg`;
      await writeFile(join(outDir, name), slide.data);
      files.push(`/carousels/${folder}-x/${name}`);
    }

    // Repoint this carousel's X drafts:
    //  - single post (type "tweet") → up to 4 images on the one tweet;
    //  - thread → ALL slides, so publish-service can put the cover on the lead
    //    tweet and one slide per reply (image-per-tweet). Order matches the
    //    thread copy: slide-01 cover → lead, slide-02.. → reply 1, 2, ….
    const drafts = xDrafts.filter((d) => {
      const m = ((d.payload ?? {}) as Record<string, unknown>).generationMetadata as Record<string, unknown> | undefined;
      return m?.sourceItemId === id;
    });
    for (const d of drafts) {
      const media = d.type === "tweet" ? files.slice(0, 4) : files;
      await prisma.contentItem.update({ where: { id: d.id }, data: { assetUrls: media } });
    }
    console.log(`  ✓ ${id} → ${files.length} X slides in ${folder}-x, repointed ${drafts.length} draft(s)`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
