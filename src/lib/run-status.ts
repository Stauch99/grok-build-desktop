import { tr } from "./i18n-bridge";

export type RunStatusKind = "disconnected" | "trust-required" | "permission" | "question" | "stalled" | "running" | "plan-complete" | "idle";
export type RunStatusInput = { disconnected?: boolean; trustRequired?: boolean; pending?: "permission" | "question" | null; running?: boolean; stalled?: boolean; stallDetail?: string; planComplete?: boolean };
export type RunStatus = { kind: RunStatusKind; label: string; detail?: string };
const LABEL_KEYS: Record<RunStatusKind, string> = {
  disconnected: "run.disconnected",
  "trust-required": "run.trustRequired",
  permission: "run.permission",
  question: "run.question",
  stalled: "run.stalled",
  running: "run.running",
  "plan-complete": "run.planComplete",
  idle: "",
};
export function deriveRunStatus(input: RunStatusInput): RunStatus {
  let kind: RunStatusKind = "idle";
  if (input.disconnected) kind = "disconnected";
  else if (input.trustRequired) kind = "trust-required";
  else if (input.pending === "permission") kind = "permission";
  else if (input.pending === "question") kind = "question";
  else if (input.running && input.stalled) kind = "stalled";
  else if (input.running) kind = "running";
  else if (input.planComplete) kind = "plan-complete";
  const label = LABEL_KEYS[kind] ? tr(LABEL_KEYS[kind]) : "";
  return kind === "stalled" && input.stallDetail ? { kind, label, detail: input.stallDetail } : { kind, label };
}

/** Running chrome for this pane, including the gap after send before session ids catch up. */
export function mainPaneIsBusy(opts: {
  busy: boolean;
  sessionId: string | null;
  runningSessionId: string | null;
}): boolean {
  if (!opts.busy) return false;
  if (opts.runningSessionId && opts.sessionId && opts.sessionId !== opts.runningSessionId) return false;
  return true;
}

/** Settle and hang watchdogs must read the running session, not whichever chat is on screen. */
export function shouldWatchDisplayedSession(opts: {
  boundSessionId: string | null;
  runningSessionId: string | null;
}): boolean {
  if (opts.runningSessionId && opts.boundSessionId && opts.boundSessionId !== opts.runningSessionId) {
    return false;
  }
  return true;
}
