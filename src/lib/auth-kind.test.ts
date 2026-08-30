import { describe, expect, it } from "vitest";
import { classifyAuthKind, shouldPollBilling, shouldShowUsageRing } from "./auth-kind";

describe("classifyAuthKind", () => {
  it("returns none when neither login nor key exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: false, hasApiKey: false })).toBe("none");
  });

  it("returns subscription when only native login exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: true, hasApiKey: false })).toBe("subscription");
  });

  it("returns api when only a key exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: false, hasApiKey: true })).toBe("api");
  });

  it("lets the API key win when both exist", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: true, hasApiKey: true })).toBe("api");
  });
});

describe("shouldShowUsageRing", () => {
  it("shows the ring only for subscription", () => {
    expect(shouldShowUsageRing("subscription")).toBe(true);
    expect(shouldShowUsageRing("api")).toBe(false);
    expect(shouldShowUsageRing("none")).toBe(false);
  });
});

describe("shouldPollBilling", () => {
  it("matches shouldShowUsageRing for subscription, api, and none", () => {
    for (const kind of ["subscription", "api", "none"] as const) {
      expect(shouldPollBilling(kind)).toBe(shouldShowUsageRing(kind));
    }
  });
});
