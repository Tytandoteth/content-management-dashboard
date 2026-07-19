import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  LocalFsStorage,
  renderCarousel,
  type CarouselSpec,
  type RenderOptions,
  type StorageProvider,
  type StoredCarousel,
} from "@cmd/carousel-render";
import { VercelBlobStorage } from "./blob-storage.js";
import { env } from "../env.js";
import { carouselPublicDir } from "./paths.js";

// Re-exported for any existing callers — the definition itself lives in
// paths.ts, a dependency-free module (see its docstring for why that split
// matters for serverless bundle size).
export { carouselPublicDir };

/**
 * Pick where slides land: Vercel Blob when a blob token is present (serverless
 * hosts can't write to disk), else the local public dir for dev.
 */
function makeStorage(): StorageProvider {
  if (env.blobConfigured()) return new VercelBlobStorage();
  return new LocalFsStorage(carouselPublicDir(), "/carousels");
}

export async function renderAndStore(
  id: string,
  spec: CarouselSpec,
  options: RenderOptions = {},
): Promise<StoredCarousel> {
  const slides = await renderCarousel(spec, { scale: env.carouselRenderScale(), ...options });
  return makeStorage().save(id, slides);
}

/**
 * Read a stored slide's bytes regardless of where `renderAndStore` put it:
 * a local `/carousels/<id>/slide-NN.*` path (dev / disk storage), or an
 * absolute Vercel Blob URL (serverless — the filesystem isn't writable there,
 * so slides never land on disk). Callers that turn slides back into files
 * (staging export, the .zip download) go through this instead of assuming disk.
 */
export async function readSlideAsset(url: string): Promise<Buffer | null> {
  const local = url.match(/^\/carousels\/(.+)$/);
  if (local) {
    try {
      return await readFile(join(carouselPublicDir(), local[1]!));
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}
