import { describe, it, expect, afterEach } from "vitest";
import { requireMachineAuth, isPlaceholderToken, MACHINE_AUTH_HEADER } from "./machine-auth.js";

const TOKEN = "test-machine-token";
const saved = process.env.CONTROL_PLANE_API_TOKEN;

afterEach(() => {
  if (saved === undefined) delete process.env.CONTROL_PLANE_API_TOKEN;
  else process.env.CONTROL_PLANE_API_TOKEN = saved;
});

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/api/scheduler/tick", { method: "POST", headers });

describe("requireMachineAuth", () => {
  it("FAILS CLOSED when no token is configured", async () => {
    // The regression this exists to prevent: the cron routes used to do
    // `if (token) { ...check... }`, so an unset token skipped the check entirely
    // and left publishing, event delivery and analytics open to anonymous
    // callers. These routes are in the middleware's public list, so nothing else
    // guards them — and a fresh self-hosted install is exactly where the token
    // is most likely to be unset.
    delete process.env.CONTROL_PLANE_API_TOKEN;
    const res = requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: "anything" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect((await res!.json()).code).toBe("machine_auth_unconfigured");
  });

  it("REFUSES the shipped .env.example placeholder", async () => {
    // `.env.example` used to ship CONTROL_PLANE_API_TOKEN="change-me-long-random-string"
    // as a live value, so every default install shared one token that anyone can
    // read in the public repo — `x-cmd-signature: change-me-long-random-string`
    // authorized the scheduler/outbox/analytics crons on any of them. A token
    // nobody changed is not a secret, so it is treated as unconfigured.
    process.env.CONTROL_PLANE_API_TOKEN = "change-me-long-random-string";
    const res = requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: "change-me-long-random-string" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect((await res!.json()).code).toBe("machine_auth_unconfigured");
  });

  it.each(["change-me-anything", "CHANGE-ME-LONG-RANDOM-STRING", "  changeme  ", "your-token-here", "secret"])(
    "refuses the placeholder %j",
    async (placeholder) => {
      process.env.CONTROL_PLANE_API_TOKEN = placeholder;
      const res = requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: placeholder }));
      expect(res!.status).toBe(503);
      expect((await res!.json()).code).toBe("machine_auth_unconfigured");
    },
  );

  it("refuses an all-whitespace token", () => {
    process.env.CONTROL_PLANE_API_TOKEN = "   ";
    expect(requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: "   " }))?.status).toBe(503);
  });

  it("isPlaceholderToken tells a real generated secret from a placeholder", () => {
    expect(isPlaceholderToken("")).toBe(true);
    expect(isPlaceholderToken("change-me-long-random-string")).toBe(true);
    // openssl rand -hex 32
    expect(isPlaceholderToken("9f2c1b7a4e6d8035af1c2e5b7d9046a3c8e1f2b4d6a80953c7e1f2b4d6a80953")).toBe(false);
  });

  it("rejects a request with no signature header", () => {
    process.env.CONTROL_PLANE_API_TOKEN = TOKEN;
    expect(requireMachineAuth(req())?.status).toBe(401);
  });

  it("rejects a wrong token", () => {
    process.env.CONTROL_PLANE_API_TOKEN = TOKEN;
    expect(requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: "wrong" }))?.status).toBe(401);
  });

  it("accepts the correct token", () => {
    process.env.CONTROL_PLANE_API_TOKEN = TOKEN;
    expect(requireMachineAuth(req({ [MACHINE_AUTH_HEADER]: TOKEN }))).toBeNull();
  });
});
