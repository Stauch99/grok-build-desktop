export type RunStatusKind = "disconnected" | "trust-required" | "permission" | "question" | "stalled" | "running" | "plan-complete" | "idle";
export type RunStatusInput = { disconnected?: boolean; trustRequired?: boolean; pending?: "permission" | "question" | null; running?: boolean; stalled?: boolean; stallDetail?: string; planComplete?: boolean };
export type RunStatus = { kind: RunStatusKind; label: string; detail?: string };
const LABELS: Record<RunStatusKind, string> = { disconnected: "Agent 已断开", "trust-required": "需要信任工作区", permission: "需要许可", question: "需要回答", stalled: "运行可能停滞", running: "正在运行", "plan-complete": "计划已完成", idle: "" };
export function deriveRunStatus(input: RunStatusInput): RunStatus {
  let kind: RunStatusKind = "idle";
  if (input.disconnected) kind = "disconnected";
  else if (input.trustRequired) kind = "trust-required";
  else if (input.pending === "permission") kind = "permission";
  else if (input.pending === "question") kind = "question";
  else if (input.running && input.stalled) kind = "stalled";
  else if (input.running) kind = "running";
  else if (input.planComplete) kind = "plan-complete";
  return kind === "stalled" && input.stallDetail ? { kind, label: LABELS[kind], detail: input.stallDetail } : { kind, label: LABELS[kind] };
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
