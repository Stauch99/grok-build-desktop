import { describe, expect, it } from "vitest";
import { evaluateDreamGates } from "./memory-gates";

const base = {
  enabled: true,
  now: 1_000_000,
  lastDeepAt: null as number | null,
  lastScanAt: null as number | null,
  pendingMaterial: 1,
  thresholdSessions: 8,
  lockHeld: false,
  trigger: "schedule" as const,
};

describe("evaluateDreamGates", () => {
  it("passes a first scheduled run with pending material", () => {
    expect(evaluateDreamGates(base)).toEqual({ ok: true });
  });

  it("blocks when disabled, locked, or empty", () => {
    expect(evaluateDreamGates({ ...base, enabled: false })).toEqual({ ok: false, reason: "disabled" });
    expect(evaluateDreamGates({ ...base, lockHeld: true })).toEqual({ ok: false, reason: "locked" });
    expect(evaluateDreamGates({ ...base, pendingMaterial: 0 })).toEqual({ ok: false, reason: "no-material" });
  });

  it("enforces 20h and 10min on schedule", () => {
    expect(evaluateDreamGates({ ...base, lastDeepAt: 1_000_000 - 19 * 60 * 60 * 1000 })).toEqual({
      ok: false,
      reason: "too-soon",
    });
    expect(evaluateDreamGates({ ...base, lastScanAt: 1_000_000 - 5 * 60 * 1000 })).toEqual({
      ok: false,
      reason: "scan-throttle",
    });
  });

  it("lets manual skip 20h and material count", () => {
    expect(evaluateDreamGates({ ...base, trigger: "manual", pendingMaterial: 0, lastDeepAt: 999_000 })).toEqual({
      ok: true,
    });
  });

  it("treats launch like schedule: leftover material waits for the next gate, it does not auto-run", () => {
    expect(evaluateDreamGates({ ...base, trigger: "launch", pendingMaterial: 0 })).toEqual({
      ok: false,
      reason: "no-material",
    });
    expect(
      evaluateDreamGates({
        ...base,
        trigger: "launch",
        pendingMaterial: 1,
        lastDeepAt: 1_000_000 - 19 * 60 * 60 * 1000,
      }),
    ).toEqual({ ok: false, reason: "too-soon" });
  });

  describe("threshold trigger (accumulation gate)", () => {
    const thresh = { ...base, trigger: "threshold" as const, pendingMaterial: 8, thresholdSessions: 8 };

    it("passes when pendingMaterial meets the threshold and last sweep was >4h ago", () => {
      expect(evaluateDreamGates({ ...thresh, lastDeepAt: 1_000_000 - 5 * 60 * 60 * 1000 })).toEqual({ ok: true });
    });

    it("fails when pendingMaterial is below the configured threshold", () => {
      expect(
        evaluateDreamGates({
          ...thresh,
          pendingMaterial: 7,
          lastDeepAt: 1_000_000 - 5 * 60 * 60 * 1000,
        }),
      ).toEqual({ ok: false, reason: "below-threshold" });
    });

    it("fails when the last deep sweep was under 4 hours ago even if threshold is met", () => {
      expect(
        evaluateDreamGates({
          ...thresh,
          lastDeepAt: 1_000_000 - 3 * 60 * 60 * 1000,
        }),
      ).toEqual({ ok: false, reason: "too-soon" });
    });
  });
});
