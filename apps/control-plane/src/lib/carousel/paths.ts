import { join } from "node:path";
import { env } from "../env.js";

/**
 * Where rendered carousel slide PNGs/JPGs live on disk (dev, or a persistent
 * volume host). Deliberately dependency-free — anything that only needs this
 * path (like the /api/carousels file-serving route) should import it from
 * HERE, not from store.ts, which pulls in the full Satori/resvg/sharp render
 * engine and @vercel/blob. A route that just serves a static file from disk
 * has no business bundling ~390MB of rendering-stack dependencies into its
 * serverless function — Next traces a route's ENTIRE import graph into its
 * function bundle, so a single shared module with heavy imports poisons every
 * route that touches it, even for exports that never call the heavy code.
 */
export function carouselPublicDir(): string {
  return env.carouselPublicDir() || join(process.cwd(), "public", "carousels");
}
