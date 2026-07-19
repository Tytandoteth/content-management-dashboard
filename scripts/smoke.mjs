#!/usr/bin/env node
/**
 * End-to-end smoke test against a running control plane.
 *
 *   pnpm dev            # in one terminal (http://localhost:3001)
 *   node scripts/smoke.mjs
 *
 * Walks one content item through the full lifecycle via the public API and
 * asserts the state machine enforces its hard rules. Exits non-zero on failure.
 */
const BASE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3001";

let failures = 0;
function check(label, cond) {
  const mark = cond ? "✓" : "✗";
  console.log(`  ${mark} ${label}`);
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

async function transition(id, body, expectStatus = 200) {
  const r = await api("POST", `/api/content/${id}/transition`, body);
  check(`${body.to} → HTTP ${r.status} (want ${expectStatus})`, r.status === expectStatus);
  return r;
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  console.log("Create:");
  const created = await api("POST", "/api/content", {
    type: "tweet",
    title: "gm — smoke test",
    createdBy: "smoke",
    status: "draft",
  });
  check("create → HTTP 201", created.status === 201);
  const id = created.json?.item?.id;
  check("returned an id", Boolean(id));
  if (!id) return;

  console.log("\nHard rule — illegal jumps are refused:");
  await transition(id, { to: "published", actor: "smoke" }, 409);
  await transition(id, { to: "approved", actor: "smoke" }, 409);

  console.log("\nHard rule — reject needs a reason:");
  // Move to in_review first so rejected is a *legal* edge; only the reason is missing.
  await transition(id, { to: "in_review", actor: "smoke" }, 200);
  await transition(id, { to: "rejected", actor: "smoke" }, 409);
  await transition(id, { to: "rejected", actor: "smoke", reason: "off-brand" }, 200);

  console.log("\nHappy path — idea/draft → measured:");
  await transition(id, { to: "draft", actor: "smoke" }, 200); // rejected → draft
  await transition(id, { to: "in_review", actor: "smoke" }, 200);
  await transition(id, { to: "approved", actor: "smoke" }, 200);
  await transition(id, { to: "scheduled", actor: "smoke", scheduledAt: new Date().toISOString() }, 200);
  await transition(id, { to: "published", actor: "smoke", postizPostId: "smoke_post_1" }, 200);
  await transition(id, { to: "measured", actor: "smoke" }, 200);

  console.log("\nVerify final state:");
  const list = await api("GET", "/api/content?status=measured");
  const found = (list.json?.items ?? []).some((i) => i.id === id);
  check("item is measured", found);

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
