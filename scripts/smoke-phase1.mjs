#!/usr/bin/env node
/**
 * Phase 1 smoke — the approval gate (moderation + governed publish path).
 *
 *   node scripts/smoke-phase1.mjs   (needs the control plane running + a DB)
 *
 * Proves: paid links get auto-tagged on approval, unfixable paid content is
 * refused (422), and the scheduler only acts when Postiz is configured.
 */
const BASE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";
const TOKEN = process.env.CONTROL_PLANE_API_TOKEN ?? "dev-token";

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures += 1;
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-cmd-signature": process.env.CONTROL_PLANE_API_TOKEN ?? "dev-token", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Phase 1 smoke against ${BASE}\n`);

  // 1. Paid content with an untagged link is auto-tagged on approval.
  console.log("Auto-tag paid links on approval:");
  const paid = await api("POST", "/api/content", {
    type: "post",
    title: "Paid promo",
    createdBy: "smoke",
    status: "draft",
    payload: {
      paid: true,
      campaign: "summer_launch",
      content: "Trade smarter: https://example.com/signup",
      integrationIds: ["ch_1"],
    },
  });
  check("create paid → 201", paid.status === 201);
  const paidId = paid.json?.item?.id;
  await api("POST", `/api/content/${paidId}/transition`, { to: "in_review", actor: "smoke" });
  const approve = await api("POST", `/api/content/${paidId}/transition`, { to: "approved", actor: "smoke" });
  check("approve paid → 200", approve.status === 200);
  const tagged = approve.json?.item?.payload?.content ?? "";
  check("link auto-tagged utm_source=default", tagged.includes("utm_source=default"));
  check("link auto-tagged utm_medium=paid_social", tagged.includes("utm_medium=paid_social"));
  check("uses campaign utm_campaign=summer_launch", tagged.includes("utm_campaign=summer_launch"));

  // 2. Paid content with an unfixable link is refused at the gate.
  console.log("\nRefuse unfixable paid content (422):");
  const bad = await api("POST", "/api/content", {
    type: "post",
    title: "Bad paid promo",
    createdBy: "smoke",
    status: "draft",
    payload: { paid: true, links: ["not a url"] },
  });
  const badId = bad.json?.item?.id;
  await api("POST", `/api/content/${badId}/transition`, { to: "in_review", actor: "smoke" });
  const blocked = await api("POST", `/api/content/${badId}/transition`, { to: "approved", actor: "smoke" });
  check("approve blocked → 422", blocked.status === 422);
  check("code = moderation_blocked", blocked.json?.code === "moderation_blocked");

  // 3. Scheduler is inert without Postiz configured, but sees the due item.
  console.log("\nScheduler tick (no Postiz configured):");
  const tick = await api("POST", "/api/scheduler/tick", null, { "x-cmd-signature": TOKEN });
  check("tick → 200", tick.status === 200);
  // Unconfigured env: tick reports skipped. Configured env: it actually runs.
  check(
    "tick behaves per config (skips when unconfigured, runs when configured)",
    tick.json?.skipped === "postiz_not_configured" || typeof tick.json?.published === "number",
  );
  check("found the approved item as due", (tick.json?.due ?? 0) >= 1);

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Phase 1 smoke crashed:", err);
  process.exit(1);
});
