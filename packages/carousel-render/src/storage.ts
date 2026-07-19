import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RenderedSlide } from "./types.js";

/**
 * Where rendered slides land. Phase 1 writes PNGs to the local filesystem
 * (`output/tiktok/<id>/`); the `publicBaseUrl` option lets the same provider
 * return web-reachable URLs once a static route / object store is wired, so
 * Phase 2 (API auto-publish) can swap storage without touching the renderer.
 */

export interface StoredCarousel {
  id: string;
  dir: string;
  /** Ordered asset references — filesystem paths, or URLs if publicBaseUrl set. */
  files: string[];
}

export interface StorageProvider {
  save(id: string, slides: RenderedSlide[]): Promise<StoredCarousel>;
}

export class LocalFsStorage implements StorageProvider {
  constructor(
    private readonly baseDir: string,
    private readonly publicBaseUrl?: string,
  ) {}

  async save(id: string, slides: RenderedSlide[]): Promise<StoredCarousel> {
    const dir = join(this.baseDir, id);
    await mkdir(dir, { recursive: true });
    const files: string[] = [];
    for (const s of slides) {
      const name = `slide-${String(s.index + 1).padStart(2, "0")}.${s.ext}`;
      await writeFile(join(dir, name), s.data);
      files.push(
        this.publicBaseUrl
          ? `${this.publicBaseUrl.replace(/\/$/, "")}/${id}/${name}`
          : join(dir, name),
      );
    }
    return { id, dir, files };
  }
}
