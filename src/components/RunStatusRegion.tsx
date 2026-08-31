import type { RunStatus } from "../lib/run-status";
import { DockCapsule } from "./ComposerDock";

const TONE: Record<string, "live" | "danger" | "ok" | "warn" | "neutral"> = {
  running: "live",
  disconnected: "danger",
  "trust-required": "danger",
  permission: "warn",
  question: "warn",
  stalled: "warn",
  "plan-complete": "ok",
};

export function RunStatusRegion({ status }: { status: RunStatus }) {
  if (status.kind === "idle") return null;
  return (
    <DockCapsule
      tone={TONE[status.kind] ?? "neutral"}
      className={`run-status-region ${status.kind}`}
    >
      <span className="run-status-dot" aria-hidden="true" />
      <strong>{status.label}</strong>
      {status.detail ? <span>{status.detail}</span> : null}
    </DockCapsule>
  );
}
