#!/usr/bin/env node
/**
 * Phase 4 smoke — the Orchestrator (Chat/Ask).
 *
 *   pnpm db:seed && node scripts/smoke-phase4.mjs
 *
 * Proves: plain-English → plan, preview vs. execute, generated content lands as
 * drafts (never published), and recipe requests route to run_recipe.
 * Without ANTHROPIC_API_KEY it exercises the deterministic heuristic planner.
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
  console.log(`Phase 4 smoke against ${BASE}\n`);

  console.log("Preview a plan (execute=false):");
  const preview = await api("POST", "/api/orchestrate", {
    request: "Turn last week's podcast into 8 clips and queue them",
    execute: false,
  });
  check("POST /api/orchestrate → 200", preview.status === 200);
  check("planner ran", Boolean(preview.json?.plan?.planner));
  // Heuristic plans generate_content(count=8); a real LLM planner may (validly)
  // choose run_recipe(podcast-to-clips) instead. Both are catalog tools.
  const pTool = preview.json?.plan?.steps?.[0]?.tool;
  check("planned a catalog tool", pTool === "generate_content" || pTool === "run_recipe");
  check(
    "plan honors the podcast→clips intent",
    pTool === "run_recipe" || preview.json?.plan?.steps?.[0]?.args?.count === 8,
  );
  check("preview did NOT execute", preview.json?.executed === false && preview.json?.createdItemIds.length === 0);

  console.log("\nExecute the plan:");
  const run = await api("POST", "/api/orchestrate", {
    request: "Turn last week's podcast into 8 clips and queue them",
  });
  check("status executed", run.json?.status === "executed");
  check("created drafts", (run.json?.createdItemIds?.length ?? 0) >= 1);

  console.log("\nHuman-in-the-loop: generated content is draft, not published:");
  const firstId = run.json?.createdItemIds?.[0];
  const list = await api("GET", "/api/content?status=draft");
  const found = (list.json?.items ?? []).find((i) => i.id === firstId);
  check("orchestrator item is a draft", found?.status === "draft");
  check(
    "created by the engine (orchestrator or recipe)",
    found?.createdBy === "orchestrator" || String(found?.createdBy ?? "").startsWith("recipe:"),
  );
  // It still has to pass review like everything else.
  await api("POST", `/api/content/${firstId}/transition`, { to: "in_review", actor: "smoke" });
  const ap = await api("POST", `/api/content/${firstId}/transition`, { to: "approved", actor: "smoke" });
  check("draft flows through the approval gate", ap.status === 200);

  console.log("\nRecipe routing:");
  const recipe = await api("POST", "/api/orchestrate", {
    request: "Run the podcast-to-clips recipe on https://ex.com/ep.mp4",
  });
  check("routed to run_recipe", recipe.json?.plan?.steps?.[0]?.tool === "run_recipe");
  check("recipe produced 10 drafts", recipe.json?.createdItemIds?.length === 10);

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Phase 4 smoke crashed:", err);
  process.exit(1);
});
