import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { CAROUSEL_FORMATS, logoUrlForTool, logoDomainFor } from "@cmd/brand";
import { loadBrandFonts } from "./fonts.js";
import { slideElement, type SlideContext } from "./templates.js";
import type { CarouselSpec, RenderOptions, RenderedSlide } from "./types.js";

/**
 * Render a CarouselSpec into branded PNG slides. Pure compute: copy + (optional)
 * background URLs in, PNG bytes out. The composer/control-plane decides where
 * the bytes are stored (see StorageProvider).
 */

function guessMime(url: string): string {
  const u = url.split("?")[0]!.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function fetchAsDataUri(url: string): Promise<string | undefined> {
  // Already a data URI? Use as-is.
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? guessMime(url);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function renderCarousel(
  spec: CarouselSpec,
  options: RenderOptions = {},
): Promise<RenderedSlide[]> {
  // Pick the platform format (canvas size + safe zones). Default TikTok 9:16.
  // Output is JPEG at ≤1080p — accepted by both TikTok and Instagram photo posts.
  const canvas = CAROUSEL_FORMATS[options.format ?? "tiktok"];
  const width = options.width ?? canvas.width;
  const height = options.height ?? canvas.height;
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const quality = options.quality && options.quality > 0 ? options.quality : 90;
  const fonts = await loadBrandFonts();
  const total = spec.slides.length;

  const out: RenderedSlide[] = [];
  for (let i = 0; i < spec.slides.length; i++) {
    const slide = spec.slides[i]!;
    const backgroundDataUri = slide.bgImageUrl
      ? await fetchAsDataUri(slide.bgImageUrl)
      : undefined;
    // Resolve the tool's logo (social proof) to a data URI when we can map it.
    const logoUrl = logoUrlForTool(slide.tool);
    const logoDataUri = logoUrl ? await fetchAsDataUri(logoUrl) : undefined;
    // The tool's domain, shown on-slide so viewers see where to get it.
    const toolDomain = slide.tool ? logoDomainFor(slide.tool) ?? undefined : undefined;
    // Resolve the repo/stat card's avatar/logo to a data URI (same path as
    // backgrounds/tool logos) so Satori can embed it.
    const cardAvatarDataUri = slide.card?.avatarUrl
      ? await fetchAsDataUri(slide.card.avatarUrl)
      : undefined;
    const ctx: SlideContext = {
      index: i + 1,
      total,
      width,
      height,
      style: options.style ?? "editorial",
      backgroundDataUri,
      logoDataUri,
      toolDomain,
      cardAvatarDataUri,
      safeTop: canvas.safeTop,
      safeRight: canvas.safeRight,
      safeBottom: canvas.safeBottom,
      safeLeft: canvas.safeLeft,
      hideSwipeHint: options.hideSwipeHint,
      handle: options.handle,
    };
    const element = slideElement(slide, ctx);
    // Satori's typings expect a React node; our plain vnode is accepted at
    // runtime (Satori's own JSX shape). Cast through `never` to bypass JSX types.
    const svg = await satori(element as never, { width, height, fonts });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(width * scale) } })
      .render()
      .asPng();
    // TikTok photos must be JPEG/WebP (not PNG) and ≤1080p — transcode to JPEG.
    const data = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
    out.push({ index: i, role: slide.role, data: new Uint8Array(data), ext: "jpg" });
  }
  return out;
}
