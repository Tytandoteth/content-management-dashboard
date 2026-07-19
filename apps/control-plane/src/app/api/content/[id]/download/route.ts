import JSZip from "jszip";
import { prisma } from "@cmd/db";
import { BRAND_IDENTITY } from "@cmd/brand";
import { readSlideAsset } from "@/lib/carousel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "carousel";
}

/**
 * GET /api/content/:id/download — download a carousel as a .zip: the slide PNGs
 * (slide-01.png …), caption.txt (caption + hashtags), and post.json. The manual
 * escape hatch — grab the assets and post by hand.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return new Response("not found", { status: 404 });

  const assetUrls = Array.isArray(item.assetUrls) ? (item.assetUrls as unknown[]) : [];
  const images = assetUrls.filter((u): u is string => typeof u === "string");
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const caption = typeof payload.content === "string" && payload.content.trim() ? payload.content : item.title;

  const zip = new JSZip();
  let n = 0;
  const slideNames: string[] = [];
  for (const url of images) {
    const buf = await readSlideAsset(url);
    if (!buf) continue; // skip a missing slide rather than fail the whole download
    const ext = url.split(".").pop()?.toLowerCase() || "jpg";
    const name = `slide-${String(++n).padStart(2, "0")}.${ext}`;
    zip.file(name, buf);
    slideNames.push(name);
  }

  if (slideNames.length === 0) {
    return new Response("no downloadable slides for this item", { status: 409 });
  }

  zip.file("caption.txt", `${caption}\n`);
  zip.file(
    "post.json",
    JSON.stringify(
      { id: item.id, title: item.title, handle: BRAND_IDENTITY.handle, ctaUrl: BRAND_IDENTITY.ctaUrl, slides: slideNames, caption },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${slugify(item.title)}.zip`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
