#!/usr/bin/env node
/**
 * Phase 3 smoke — Generation engines + Recipes.
 *
 *   pnpm db:seed && node scripts/smoke-phase3.mjs
 *
 * Proves: the registry exposes engines with health, generation produces draft
 * content that flows through the approval gate, and a recipe expands into a
 * scheduled batch of drafts.
 */
const BASE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures += 1;
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-cmd-signature": process.env.CONTROL_PLANE_API_TOKEN ?? "dev-token" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Phase 3 smoke against ${BASE}\n`);

  console.log("Engine registry + health:");
  const gens = await api("GET", "/api/generators");
  check("GET /api/generators → 200", gens.status === 200);
  const names = (gens.json?.generators ?? []).map((g) => g.name);
  check("stub engine registered & healthy", (gens.json?.generators ?? []).some((g) => g.name === "stub" && g.health === "ok"));
  check("opusclip present as a manual lane", (gens.json?.generators ?? []).some((g) => g.name === "opusclip" && g.manual === true));

  console.log("\nGenerate → drafts:");
  const gen = await api("POST", "/api/generate", {
    type: "clip",
    prompt: "Cut highlights from the AMA",
    count: 3,
    sourceUrl: "https://example.com/ama.mp4",
  });
  check("POST /api/generate → 201", gen.status === 201);
  check("engine routed to stub", gen.json?.engine === "stub");
  check("produced 3 items", gen.json?.count === 3);
  const item = gen.json?.items?.[0];
  check("item is a draft", item?.status === "draft");
  check("item carries an asset URL", Array.isArray(item?.assetUrls) && item.assetUrls.length === 1);

  console.log("\nGenerated content flows through the approval gate:");
  const rv = await api("POST", `/api/content/${item.id}/transition`, { to: "in_review", actor: "smoke" });
  const ap = await api("POST", `/api/content/${item.id}/transition`, { to: "approved", actor: "smoke" });
  check("draft → in_review → approved (200)", rv.status === 200 && ap.status === 200);

  console.log("\nRecipe expands into a scheduled batch:");
  const recipes = await api("GET", "/api/recipes");
  check("podcast-to-clips recipe present", (recipes.json?.recipes ?? []).some((r) => r.slug === "podcast-to-clips"));
  const run = await api("POST", "/api/recipes/podcast-to-clips/run", {
    sourceUrl: "https://example.com/podcast-ep42.mp4",
  });
  check("run recipe → 201", run.status === 201);
  check("recipe produced 10 drafts", run.json?.count === 10);
  const scheduled = (run.json?.items ?? []).filter((i) => i.payload?.desiredScheduledAt);
  check("drafts carry a desired schedule (weekday slots)", scheduled.length === 10);

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Phase 3 smoke crashed:", err);
  process.exit(1);
});
