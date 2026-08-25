import { NextResponse } from "next/server";
import { env } from "./env.js";

/**
 * Auth for the machine-driven cron endpoints (scheduler tick, outbox drain,
 * analytics tick).
 *
 * These routes are in the middleware's public-route list — they are called by an
 * external cron with no session — so this is the ONLY thing standing in front of
 * them. Each route used to inline `if (token) { ...check... }`, which meant an
 * unset CONTROL_PLANE_API_TOKEN disabled the check entirely and left publishing,
 * event delivery and analytics open to anonymous callers. That is a fail-OPEN
 * default in exactly the place that can post to a live social account, and it
 * bit hardest on a fresh self-hosted install, where the token is the env var
 * people are most likely not to have set yet.
 *
 * Now it fails CLOSED: no token configured means no machine access, and the
 * response says why rather than silently allowing the call.
 *
 * A token that was never CHANGED is the same hole wearing a disguise: shipping
 * `CONTROL_PLANE_API_TOKEN="change-me-long-random-string"` as a live value in
 * `.env.example` meant every default install shared one publicly-readable
 * secret, and `x-cmd-signature: change-me-long-random-string` authorized the
 * cron endpoints on any of them. The placeholders below are therefore treated as
 * "not configured", not as a token.
 */
export const MACHINE_AUTH_HEADER = "x-cmd-signature";

/**
 * Values that are documentation, not secrets. Matched case-insensitively after
 * trimming; anything starting with "change-me" is caught by the prefix rule.
 */
const PLACEHOLDER_TOKENS = [
  "change-me-long-random-string",
  "long-random-string",
  "your-token-here",
  "changeme",
  "secret",
  "token",
];

/** True when the configured token is absent or is a shipped placeholder. */
export function isPlaceholderToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return true;
  if (t.startsWith("change-me") || t.startsWith("changeme")) return true;
  return PLACEHOLDER_TOKENS.includes(t);
}

/**
 * Returns a 401/503 response when the caller is not an authorized machine, or
 * `null` when the request may proceed.
 *
 *   const denied = requireMachineAuth(request);
 *   if (denied) return denied;
 */
export function requireMachineAuth(request: Request): NextResponse | null {
  const token = env.controlPlaneApiToken();
  if (isPlaceholderToken(token)) {
    return NextResponse.json(
      {
        error: "machine access is not configured",
        code: "machine_auth_unconfigured",
        hint: `Set CONTROL_PLANE_API_TOKEN to a generated secret (openssl rand -hex 32) and send it as ${MACHINE_AUTH_HEADER}. The example placeholder is not accepted.`,
      },
      { status: 503 },
    );
  }
  if (request.headers.get(MACHINE_AUTH_HEADER) !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
