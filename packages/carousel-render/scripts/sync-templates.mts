/**
 * Codegen for the installed-template index. Scans `templates/**​/*.ts` (installed
 * template packs live there — see templates/README.md), validates every candidate
 * module against the `defineCarouselTemplate` shape, checks for id collisions
 * (against the builtins and among the scanned packs), and rewrites
 * `src/templates.index.generated.ts` deterministically.
 *
 *   pnpm --filter @cmd/carousel-render templates:sync
 *   pnpm templates:sync   (from repo root; wired in root package.json)
 *
 * Run this after installing or removing a template pack, then restart the dev
 * server / rebuild — the registry reads INSTALLED_TEMPLATES once at module load.
 *
 * Exit codes: 0 on success (whether the file changed or not), 1 when any
 * candidate fails shape validation or a template id collides.
 */
import { readdir } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineCarouselTemplate, type CarouselTemplate } from "../src/template-api.js";
import { BUILTIN_TEMPLATES } from "../src/templates.builtin.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(scriptDir, "..");
const templatesDir = join(pkgRoot, "templates");
const srcDir = join(pkgRoot, "src");
const generatedFile = join(srcDir, "templates.index.generated.ts");

const toPosix = (p: string): string => p.split(sep).join("/");
/** Path shown in messages/logs: posix, relative to the package root. */
const displayPath = (absPath: string): string => toPosix(relative(pkgRoot, absPath));

/** Recursively list every file under `dir` (skips nothing — pack folders are flat/shallow). */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** `.ts` candidates: skip `.d.ts` and `_`-prefixed basenames (helper modules, not templates). */
function isCandidate(absPath: string): boolean {
  if (!absPath.endsWith(".ts") || absPath.endsWith(".d.ts")) return false;
  const base = absPath.slice(absPath.lastIndexOf(sep) + 1);
  return !base.startsWith("_");
}

interface ValidationError {
  file: string;
  message: string;
}
interface ScannedTemplate {
  file: string; // display path
  absPath: string;
  template: CarouselTemplate;
}

async function main(): Promise<void> {
  const candidates = existsSync(templatesDir)
    ? (await walk(templatesDir)).filter(isCandidate).sort((a, b) => displayPath(a).localeCompare(displayPath(b)))
    : [];

  const errors: ValidationError[] = [];
  const scanned: ScannedTemplate[] = [];

  for (const absPath of candidates) {
    const file = displayPath(absPath);
    try {
      const mod: { default?: unknown } = await import(pathToFileURL(absPath).href);
      const template = defineCarouselTemplate(mod.default as CarouselTemplate);
      scanned.push({ file, absPath, template });
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (errors.length > 0) {
    console.error(`[templates:sync] ${errors.length} template file(s) failed validation:`);
    for (const e of errors) console.error(`  ${e.file}: ${e.message}`);
    process.exit(1);
    return;
  }

  // Duplicate id detection: against the builtins, then among the scanned packs.
  const builtinIds = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t.label]));
  const byId = new Map<string, ScannedTemplate[]>();
  for (const s of scanned) {
    const list = byId.get(s.template.id) ?? [];
    list.push(s);
    byId.set(s.template.id, list);
  }

  const dupMessages: string[] = [];
  for (const [id, list] of byId) {
    const builtinLabel = builtinIds.get(id);
    if (builtinLabel) {
      dupMessages.push(
        `id "${id}" collides with built-in template "${builtinLabel}" — offending file(s): ${list.map((s) => s.file).join(", ")}`,
      );
    }
    if (list.length > 1) {
      dupMessages.push(`id "${id}" is defined in multiple files: ${list.map((s) => s.file).join(", ")}`);
    }
  }

  if (dupMessages.length > 0) {
    console.error(`[templates:sync] duplicate template id(s) detected:`);
    for (const m of dupMessages) console.error(`  ${m}`);
    process.exit(1);
    return;
  }

  const sorted = [...scanned].sort((a, b) => a.template.id.localeCompare(b.template.id));

  const specifierFor = (absPath: string): string => {
    let rel = toPosix(relative(srcDir, absPath)).replace(/\.ts$/, ".js");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return rel;
  };

  const lines: string[] = [
    "// GENERATED FILE — do not edit by hand. Run `pnpm templates:sync` after installing template packs.",
    `import type { CarouselTemplate } from "./template-api.js";`,
    ...sorted.map((s, i) => `import t${i} from "${specifierFor(s.absPath)}";`),
    "",
    sorted.length === 0
      ? "export const INSTALLED_TEMPLATES: CarouselTemplate[] = [];"
      : `export const INSTALLED_TEMPLATES: CarouselTemplate[] = [${sorted.map((_, i) => `t${i}`).join(", ")}];`,
  ];
  const content = lines.join("\n") + "\n";

  const existing = existsSync(generatedFile) ? readFileSync(generatedFile, "utf8") : null;
  if (existing === content) {
    console.log(`[templates:sync] unchanged (${sorted.length} installed template${sorted.length === 1 ? "" : "s"})`);
  } else {
    writeFileSync(generatedFile, content, "utf8");
    console.log(`[templates:sync] updated (${sorted.length} template${sorted.length === 1 ? "" : "s"})`);
  }
  console.log("Restart the dev server (or rebuild) to pick up template changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
