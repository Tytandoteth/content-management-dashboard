import { resolve, sep } from "node:path";
import { env } from "../env.js";
import { carouselPublicDir } from "./paths.js";

/**
 * Which stored asset references the server may open. `assetUrls` can come from
 * any caller with content:create, so a value is never trusted just because it is
 * in the database: readSlideAsset re-checks at read time (rows written before
 * this check exist) and POST /api/content refuses bad values on the way in.
 */

/** The file a `/carousels/<path>` reference points at, only if it is inside the carousel dir. */
export function localAssetPath(url: string): string | null {
  const match = url.match(/^\/carousels\/(.+)$/);
  if (!match || url.includes("\0")) return null;
  const root = resolve(carouselPublicDir());
  const path = resolve(root, match[1]!);
  return path.startsWith(root + sep) ? path : null;
}

/**
 * The URL to fetch, only if it is on this studio's own Blob store. An exact host
 * match and nothing else: https, no port, no credentials. No configured store
 * means no remote read at all.
 */
export function blobAssetUrl(url: string): string | null {
  const host = env.blobStoreHost();
  if (!host) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== host) return null;
  if (parsed.port || parsed.username || parsed.password) return null;
  return parsed.href;
}

/**
 * What a caller may store. Stricter than the read check on local paths: only the
 * characters our own storage writes, so percent-encoded dots can't sit in a row
 * and be decoded by whatever reads the URL next (the publisher hands these to TikTok).
 */
export function isStorableAssetUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  if (url.startsWith("/")) return /^\/carousels\/[\w./-]+$/.test(url) && localAssetPath(url) !== null;
  return blobAssetUrl(url) !== null;
}
