import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Satori needs raw font bytes (it has no system-font access). We bundle WOFF
 * files for the brand faces — Sora (display) and Inter (body) — under
 * `packages/carousel-render/fonts/` and load them once, cached for the process.
 */

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

/** Satori's accepted font weights (subset we ship). */
type FontWeight = 400 | 500 | 600 | 700 | 800 | 900;

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: "normal";
}

const FONT_FILES: Array<{ name: string; file: string; weight: FontWeight }> = [
  { name: "Inter", file: "inter-400.woff", weight: 400 },
  { name: "Inter", file: "inter-600.woff", weight: 600 },
  { name: "Sora", file: "sora-700.woff", weight: 700 },
  { name: "Sora", file: "sora-800.woff", weight: 800 },
  // Monospace for the "terminal-dev" style — prompts, output, stats, indices.
  { name: "JetBrains Mono", file: "jetbrains-mono-400.woff", weight: 400 },
  { name: "JetBrains Mono", file: "jetbrains-mono-700.woff", weight: 700 },
];

let cache: SatoriFont[] | null = null;

export async function loadBrandFonts(): Promise<SatoriFont[]> {
  if (cache) return cache;
  cache = await Promise.all(
    FONT_FILES.map(async (f) => ({
      name: f.name,
      weight: f.weight,
      style: "normal" as const,
      data: await readFile(join(FONTS_DIR, f.file)),
    })),
  );
  return cache;
}
