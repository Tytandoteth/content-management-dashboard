import { describe, it, expect, afterEach } from "vitest";
import { requireMachineAuth, MACHINE_AUTH_HEADER } from "./machine-auth.js";

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
