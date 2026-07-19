import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES, type ContentStatus } from "./content-status.js";
import {
  IllegalTransitionError,
  TRANSITIONS,
  assertTransition,
  canTransition,
  checkTransition,
  everyPathToPublishedPassesReview,
  isTerminal,
} from "./state-machine.js";
import { eventTypeForTransition } from "./events.js";

const LEGAL_EDGES: Array<[ContentStatus, ContentStatus]> = [
  ["idea", "draft"],
  ["draft", "in_review"],
  ["in_review", "approved"],
  ["in_review", "rejected"],
  ["approved", "scheduled"],
  ["scheduled", "published"],
  ["published", "measured"],
  ["rejected", "draft"],
];

describe("legal transitions", () => {
  it.each(LEGAL_EDGES)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    // rejected needs a reason; supply one so this asserts the edge, not the gate.
    const reason = to === "rejected" ? "off-brand tone" : undefined;
    expect(checkTransition(from, to, { reason })).toEqual({ ok: true });
  });
});

describe("illegal transitions are rejected", () => {
  it("rejects skipping in_review (draft → approved)", () => {
    const result = checkTransition("draft", "approved");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("illegal_transition");
  });

  it("rejects jumping straight to published", () => {
    expect(canTransition("approved", "published")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
  });

  it("rejects every non-legal edge in the full matrix", () => {
    const legal = new Set(LEGAL_EDGES.map(([f, t]) => `${f}->${t}`));
    for (const from of CONTENT_STATUSES) {
      for (const to of CONTENT_STATUSES) {
        if (legal.has(`${from}->${to}`)) continue;
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("hard rule: nothing reaches published without passing in_review", () => {
  it("holds for every path from idea to published", () => {
    expect(everyPathToPublishedPassesReview()).toBe(true);
  });

  it("the only predecessor of published is scheduled", () => {
    const predecessors = CONTENT_STATUSES.filter((s) =>
      TRANSITIONS[s].includes("published"),
    );
    expect(predecessors).toEqual(["scheduled"]);
  });
});

describe("hard rule: rejected must carry a reason", () => {
  it("blocks rejection without a reason", () => {
    const result = checkTransition("in_review", "rejected");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("reason_required");
  });

  it("blocks rejection with a blank reason", () => {
    const result = checkTransition("in_review", "rejected", { reason: "   " });
    expect(result.ok).toBe(false);
  });

  it("allows rejection with a reason", () => {
    expect(checkTransition("in_review", "rejected", { reason: "off-brand" })).toEqual({
      ok: true,
    });
  });
});

describe("assertTransition", () => {
  it("throws IllegalTransitionError on an illegal edge", () => {
    expect(() => assertTransition("idea", "published")).toThrowError(
      IllegalTransitionError,
    );
  });

  it("does not throw on a legal edge", () => {
    expect(() => assertTransition("idea", "draft")).not.toThrow();
  });
});

describe("terminal states", () => {
  it("measured is terminal", () => {
    expect(isTerminal("measured")).toBe(true);
  });

  it("idea is not terminal", () => {
    expect(isTerminal("idea")).toBe(false);
  });
});

describe("event mapping", () => {
  it("approved emits content.approved", () => {
    expect(eventTypeForTransition("approved")).toBe("content.approved");
  });

  it("published emits content.published", () => {
    expect(eventTypeForTransition("published")).toBe("content.published");
  });

  it("draft emits nothing", () => {
    expect(eventTypeForTransition("draft")).toBeNull();
  });
});
