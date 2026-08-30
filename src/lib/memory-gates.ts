export type DreamTrigger = "schedule" | "launch" | "manual";

export type DreamGateInput = {
  enabled: boolean;
  now: number;
  lastDeepAt: number | null;
  lastScanAt: number | null;
  newSessionCount: number;
  lockHeld: boolean;
  trigger: DreamTrigger;
};

export type DreamGateResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "too-soon" | "scan-throttle" | "no-sessions" | "locked" };

export const DEEP_MIN_MS = 20 * 60 * 60 * 1000;
export const SCAN_MIN_MS = 10 * 60 * 1000;

export function evaluateDreamGates(input: DreamGateInput): DreamGateResult {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (input.lockHeld) return { ok: false, reason: "locked" };
  if (input.lastScanAt != null && input.now - input.lastScanAt < SCAN_MIN_MS) {
    return { ok: false, reason: "scan-throttle" };
  }
  const manual = input.trigger === "manual";
  if (!manual && input.lastDeepAt != null && input.now - input.lastDeepAt < DEEP_MIN_MS) {
    return { ok: false, reason: "too-soon" };
  }
  if (!manual && input.newSessionCount < 1) return { ok: false, reason: "no-sessions" };
  return { ok: true };
}
