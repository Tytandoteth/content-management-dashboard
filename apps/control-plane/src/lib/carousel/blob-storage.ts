import { put } from "@vercel/blob";
import type { RenderedSlide, StorageProvider, StoredCarousel } from "@cmd/carousel-render";

/**
 * Stores rendered slides in Vercel Blob (public) and returns their public URLs —
 * the serverless-host equivalent of LocalFsStorage. Vercel's filesystem is
 * read-only at runtime, so generated slides must go to object storage instead of
 * `public/carousels/`. Reads `BLOB_READ_WRITE_TOKEN` from the env automatically.
 */
export class VercelBlobStorage implements StorageProvider {
  async save(id: string, slides: RenderedSlide[]): Promise<StoredCarousel> {
    const files: string[] = [];
    for (const s of slides) {
      const name = `slide-${String(s.index + 1).padStart(2, "0")}.${s.ext}`;
      const contentType = s.ext === "png" ? "image/png" : s.ext === "webp" ? "image/webp" : "image/jpeg";
      const { url } = await put(`carousels/${id}/${name}`, Buffer.from(s.data), {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      files.push(url);
    }
    return { id, dir: `carousels/${id}`, files };
  }
}
