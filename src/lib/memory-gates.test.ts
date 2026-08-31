import { describe, expect, it } from "vitest";
import { evaluateDreamGates } from "./memory-gates";

const base = {
  enabled: true,
  now: 1_000_000,
  lastDeepAt: null as number | null,
  lastScanAt: null as number | null,
  newSessionCount: 1,
  lockHeld: false,
  trigger: "schedule" as const,
};

describe("evaluateDreamGates", () => {
  it("passes a first scheduled run", () => {
    expect(evaluateDreamGates(base)).toEqual({ ok: true });
  });

  it("blocks when disabled, locked, or empty", () => {
    expect(evaluateDreamGates({ ...base, enabled: false })).toEqual({ ok: false, reason: "disabled" });
    expect(evaluateDreamGates({ ...base, lockHeld: true })).toEqual({ ok: false, reason: "locked" });
    expect(evaluateDreamGates({ ...base, newSessionCount: 0 })).toEqual({ ok: false, reason: "no-sessions" });
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

  it("lets manual skip 20h and session count", () => {
    expect(evaluateDreamGates({ ...base, trigger: "manual", newSessionCount: 0, lastDeepAt: 999_000 })).toEqual({
      ok: true,
    });
  });
});
