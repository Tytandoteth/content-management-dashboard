import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ContentItem } from "@cmd/db";
import { BRAND_IDENTITY } from "@cmd/brand";
import { env } from "../env.js";
import { readSlideAsset } from "../carousel/store.js";

/**
 * Phase-1 publishing: instead of pushing to TikTok's restricted photo API, we
 * EXPORT an approved carousel as a ready-to-post bundle on disk —
 * `output/tiktok/<id>/` with the slide PNGs, a caption.txt (caption + hashtags +
 * CTA), and a post.json manifest. Drop the staging dir into an iCloud/Drive
 * synced folder (CAROUSEL_STAGING_DIR) and the bundle shows up on your phone for
 * one-tap manual posting. Auto-publish (Postiz/TikTok API) is the later, flagged
 * path; this is the safe default that ships today.
 */

export interface StagedBundle {
  dir: string;
  files: string[];
  captionPath: string;
  slideCount: number;
}

/** Where ready-to-post bundles are written. Override with CAROUSEL_STAGING_DIR. */
export function stagingDir(): string {
  return env.carouselStagingDir() || join(process.cwd(), "output", "tiktok");
}

export async function exportStaging(item: ContentItem): Promise<StagedBundle> {
  const assetUrls = Array.isArray(item.assetUrls) ? (item.assetUrls as unknown[]) : [];
  const images = assetUrls.filter((u): u is string => typeof u === "string");

  const dir = join(stagingDir(), item.id);
  await mkdir(dir, { recursive: true });

  const files: string[] = [];
  let n = 0;
  for (const url of images) {
    // Slides may be on local disk (dev) or Vercel Blob (prod) — read either way.
    const buf = await readSlideAsset(url);
    if (!buf) continue; // couldn't retrieve this slide; skip rather than fail the export
    const ext = url.split(".").pop()?.toLowerCase() || "jpg";
    const name = `slide-${String(++n).padStart(2, "0")}.${ext}`;
    const dest = join(dir, name);
    await writeFile(dest, buf);
    files.push(dest);
  }

  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const caption = typeof payload.content === "string" && payload.content.trim()
    ? payload.content
    : item.title;

  const captionPath = join(dir, "caption.txt");
  await writeFile(captionPath, `${caption}\n`);

  await writeFile(
    join(dir, "post.json"),
    JSON.stringify(
      {
        id: item.id,
        title: item.title,
        handle: BRAND_IDENTITY.handle,
        ctaUrl: BRAND_IDENTITY.ctaUrl,
        slideCount: files.length,
        slides: files.map((f) => basename(f)),
        caption,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return { dir, files, captionPath, slideCount: files.length };
}
