import { describe, expect, it } from "vitest";
import { isDue } from "./scheduler.js";

const now = new Date("2026-06-05T12:00:00.000Z");

describe("scheduler isDue selection", () => {
  it("publishes immediately when there is no scheduled time", () => {
    expect(isDue({ status: "approved", scheduledAt: null }, now)).toBe(true);
  });

  it("is due once the scheduled time has passed", () => {
    expect(
      isDue({ status: "approved", scheduledAt: new Date("2026-06-05T11:59:00Z") }, now),
    ).toBe(true);
  });

  it("is not due before its scheduled time", () => {
    expect(
      isDue({ status: "approved", scheduledAt: new Date("2026-06-05T12:01:00Z") }, now),
    ).toBe(false);
  });

  it("ignores items that are not approved", () => {
    expect(isDue({ status: "draft", scheduledAt: null }, now)).toBe(false);
    expect(isDue({ status: "published", scheduledAt: null }, now)).toBe(false);
  });
});
