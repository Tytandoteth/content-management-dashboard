import { describe, expect, it } from "vitest";
import { computeStatus } from "./status.js";

describe("computeStatus", () => {
  it("reports a plan with no steps as empty, not as a success", () => {
    expect(computeStatus([])).toBe("empty");
  });

  it("reports every step succeeding as executed", () => {
    expect(computeStatus([{ ok: true }, { ok: true }])).toBe("executed");
  });

  it("reports a mix as partial, not as a total failure", () => {
    expect(computeStatus([{ ok: true }, { ok: false }])).toBe("partial");
    expect(computeStatus([{ ok: false }, { ok: true }, { ok: true }])).toBe("partial");
  });

  it("reports every step failing as failed", () => {
    expect(computeStatus([{ ok: false }])).toBe("failed");
    expect(computeStatus([{ ok: false }, { ok: false }])).toBe("failed");
  });
});
