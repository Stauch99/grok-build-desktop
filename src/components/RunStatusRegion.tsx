import type { RunStatus } from "../lib/run-status";
export function RunStatusRegion({ status }: { status: RunStatus }) {
  if (status.kind === "idle") return null;
  return <div className={`run-status-region ${status.kind}`} role={status.kind === "disconnected" ? "alert" : "status"} aria-live="polite">
    <span className="run-status-dot" aria-hidden="true" />
    <strong>{status.label}</strong>{status.detail ? <span>{status.detail}</span> : null}
  </div>;
}
