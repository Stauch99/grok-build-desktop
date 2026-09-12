import { useState, type ReactNode } from "react";
import type { WorkItem } from "../lib/chat";
import { workRunCopy, workRunIsLive } from "../lib/work-run";
import { useLocale } from "../lib/locale-context";
import { IconLight } from "../icons";
import { WorkLiveRow, WorkTimeline } from "./WorkTimeline";

export function WorkRun({
  items,
  busy = false,
  cwd = "",
  live,
  onInspectTool,
  onStop,
  onRetry,
  onDraft,
  startedAt,
}: {
  items: WorkItem[];
  busy?: boolean;
  cwd?: string;
  live?: ReactNode;
  onInspectTool?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onStop?: () => void;
  onRetry?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onDraft?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  runId: string;
  tick?: number;
  startedAt?: number;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const running = workRunIsLive({ items, busy });
  const expanded = running || open;
  const copy = workRunCopy({ items, locale });
  const liveNode =
    running ? (live ?? (onStop ? <WorkLiveRow startedAt={startedAt} onStop={onStop} /> : null)) : null;
  return (
    <div
      className={`work-cluster work-run${copy.failed ? " failed" : ""}${running ? " live" : ""}${expanded ? " open" : ""}`}
      aria-busy={running || undefined}
    >
      {running ? null : (
        <div className="work-run-bar">
          <button
            type="button"
            className="work-run-head"
            aria-expanded={open}
            aria-label={copy.ariaLabel}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="work-run-ico" aria-hidden>
              <IconLight size={18} />
            </span>
            <span className="work-run-text">
              <span>{copy.text}</span>
            </span>
          </button>
        </div>
      )}
      {expanded ? (
        <WorkTimeline
          items={items}
          busy={running}
          cwd={cwd}
          live={liveNode}
          onInspectTool={onInspectTool}
          onRetry={onRetry}
          onDraft={onDraft}
        />
      ) : null}
    </div>
  );
}
