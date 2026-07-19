import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { carouselPublicDir } from "@/lib/carousel/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve rendered carousel slides from the storage dir (a persistent volume on
 * Railway). A next.config rewrite sends `/carousels/*` here when no static file
 * matches, so runtime-rendered images are served reliably regardless of host.
 */
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = normalize(path.join("/"));
  if (rel.includes("..") || rel.startsWith("/")) return new Response("bad path", { status: 400 });
  try {
    const data = await readFile(join(carouselPublicDir(), rel));
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(data), {
      headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
