#!/usr/bin/env node
/**
 * Phase 5 smoke — wire-up endpoints + the measured loop.
 *
 *   pnpm db:seed && node scripts/smoke-phase5.mjs
 *
 * Covers: content detail+audit, content filters, recipe CRUD,
 * orchestration-runs history, connections, and the full
 * metrics → measured close-the-loop.
 */
const BASE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";

let failures = 0;
function check(label, cond) { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) failures += 1; }
const TOKEN = process.env.CONTROL_PLANE_API_TOKEN ?? "dev-token";
async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", "x-cmd-signature": process.env.CONTROL_PLANE_API_TOKEN ?? "dev-token", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const T = (id, body) => api("POST", `/api/content/${id}/transition`, body);

async function main() {
  console.log(`Phase 5 smoke against ${BASE}\n`);

  console.log("Content detail + audit trail:");
  const created = (await api("POST", "/api/content", { type: "tweet", title: "Detail+audit probe", createdBy: "smoke", status: "draft" })).json.item;
  await T(created.id, { to: "in_review", actor: "smoke" });
  const detail = await api("GET", `/api/content/${created.id}`);
  check("GET /api/content/:id → 200", detail.status === 200);
  check("includes audit transitions", Array.isArray(detail.json.transitions) && detail.json.transitions.length >= 1);
  check("includes metrics array", Array.isArray(detail.json.metrics));

  console.log("\nContent filters:");
  const drafts = await api("GET", "/api/content?status=in_review&type=tweet");
  check("filter by status+type returns items", (drafts.json.items ?? []).some((i) => i.id === created.id));

  console.log("\nRecipe CRUD:");
  const slug = "smoke-recipe";
  await api("DELETE", `/api/recipes/${slug}`); // clean slate
  const rc = await api("POST", "/api/recipes", { name: "Smoke recipe", spec: { brief: { type: "clip", prompt: "x" }, count: 2, schedule: { kind: "immediate" } } });
  check("create recipe → 201", rc.status === 201);
  const got = await api("GET", `/api/recipes/${slug}`);
  check("GET recipe by slug", got.json.recipe?.slug === slug);
  const patched = await api("PATCH", `/api/recipes/${slug}`, { description: "edited" });
  check("PATCH recipe", patched.json.recipe?.description === "edited");
  const del = await api("DELETE", `/api/recipes/${slug}`);
  check("DELETE recipe", del.json.ok === true);

  console.log("\nOrchestration history:");
  await api("POST", "/api/orchestrate", { request: "preview only — make 2 clips", execute: false });
  const runs = await api("GET", "/api/orchestration-runs");
  check("orchestration-runs lists runs", (runs.json.runs ?? []).length >= 1);

  console.log("\nConnections:");
  const conn = await api("GET", "/api/connections");
  check("connections returns config", conn.status === 200 && typeof conn.json.config === "object");

  console.log("\nMeasured loop (metrics → measured):");
  const item = (await api("POST", "/api/content", { type: "post", title: "Measured-loop probe", createdBy: "smoke", status: "draft", payload: { content: "x" } })).json.item;
  for (const [to, extra] of [["in_review"], ["approved"], ["scheduled", { scheduledAt: new Date().toISOString() }], ["published", { postizPostId: "smoke_measure_1" }]]) {
    await T(item.id, { to, actor: "smoke", ...(extra ?? {}) });
  }
  const addImpr = 60_000_000;
  const ing = await api("POST", `/api/content/${item.id}/metrics`, { metrics: { impressions: addImpr, signups: 5000 } });
  check("ingest metrics → 201", ing.status === 201);
  const tick = await api("POST", "/api/analytics/tick", null, { "x-cmd-signature": TOKEN });
  check("analytics tick → 200", tick.status === 200);

  const measured = await api("GET", `/api/content/${item.id}`);
  check("item advanced to measured", measured.json.item?.status === "measured");
  check("measured metrics recorded", (measured.json.metrics ?? []).some((m) => m.key === "impressions" && m.value >= addImpr));

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("Phase 5 smoke crashed:", e); process.exit(1); });
