export type DreamTrigger = "schedule" | "launch" | "threshold" | "manual";

export type DreamGateInput = {
  enabled: boolean;
  now: number;
  lastDeepAt: number | null;
  lastScanAt: number | null;
  /** Sessions with new lines + MCP append batches since the last deep sweep. */
  pendingMaterial: number;
  thresholdSessions: number;
  lockHeld: boolean;
  trigger: DreamTrigger;
};

export type DreamGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: "disabled" | "too-soon" | "scan-throttle" | "no-material" | "below-threshold" | "locked";
    };

/** Nightly cadence: a sweep at most once per ~20h. */
export const DEEP_MIN_MS = 20 * 60 * 60 * 1000;
/** Accumulation trigger: never closer than 4h to the last sweep. */
export const THRESHOLD_MIN_MS = 4 * 60 * 60 * 1000;
export const SCAN_MIN_MS = 10 * 60 * 1000;
export const DEFAULT_THRESHOLD_SESSIONS = 8;
export const MIN_THRESHOLD_SESSIONS = 4;
export const MAX_THRESHOLD_SESSIONS = 20;

export function clampThresholdSessions(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD_SESSIONS;
  return Math.min(MAX_THRESHOLD_SESSIONS, Math.max(MIN_THRESHOLD_SESSIONS, Math.round(n)));
}

export function evaluateDreamGates(input: DreamGateInput): DreamGateResult {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (input.lockHeld) return { ok: false, reason: "locked" };
  if (input.lastScanAt != null && input.now - input.lastScanAt < SCAN_MIN_MS) {
    return { ok: false, reason: "scan-throttle" };
  }
  if (input.trigger === "manual") return { ok: true };
  if (input.trigger === "threshold") {
    if (input.lastDeepAt != null && input.now - input.lastDeepAt < THRESHOLD_MIN_MS) {
      return { ok: false, reason: "too-soon" };
    }
    if (input.pendingMaterial < input.thresholdSessions) return { ok: false, reason: "below-threshold" };
    return { ok: true };
  }
  if (input.lastDeepAt != null && input.now - input.lastDeepAt < DEEP_MIN_MS) {
    return { ok: false, reason: "too-soon" };
  }
  if (input.pendingMaterial < 1) return { ok: false, reason: "no-material" };
  return { ok: true };
}
