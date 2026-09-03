import { describe, expect, it } from "vitest";
import { assertTransition, transitionRules } from "./ticketRules";
import { HttpError } from "./utils";

function errorMessage(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (err) {
    if (err instanceof HttpError) return err.message;
    throw err;
  }
}

describe("ticket lifecycle rules", () => {
  it("allows exactly one step forward without a reason", () => {
    expect(assertTransition("open", "in_progress", undefined).requiresReason).toBe(false);
    expect(assertTransition("in_progress", "resolved", undefined).requiresReason).toBe(false);
    expect(assertTransition("resolved", "closed", undefined).requiresReason).toBe(false);
  });

  it("rejects skipping stages forward", () => {
    expect(errorMessage(() => assertTransition("open", "resolved", undefined))).toContain(
      "one step at a time"
    );
    expect(errorMessage(() => assertTransition("in_progress", "closed", undefined))).toContain(
      "one step at a time"
    );
  });

  it("rejects moving to the same status", () => {
    expect(errorMessage(() => assertTransition("open", "open", undefined))).toContain("already");
  });

  it("requires a reason to move backwards", () => {
    expect(errorMessage(() => assertTransition("resolved", "open", undefined))).toContain(
      "requires a reason"
    );
    expect(assertTransition("closed", "open", "Customer reopened the case").requiresReason).toBe(true);
    expect(assertTransition("resolved", "in_progress", "Needs more work").requiresReason).toBe(true);
  });

  it("flags backward targets in transitionRules", () => {
    const rules = transitionRules("resolved");
    expect(rules.find((r) => r.to === "open")?.requiresReason).toBe(true);
    expect(rules.find((r) => r.to === "closed")?.requiresReason).toBe(false);
  });
});
