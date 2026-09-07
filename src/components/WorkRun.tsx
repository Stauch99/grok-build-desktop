import { useEffect, useState, type ReactNode } from "react";
import type { WorkItem } from "../lib/chat";
import { formatLiveElapsed, workRunCopy, workRunIsLive } from "../lib/work-run";
import { useLocale, useT } from "../lib/locale-context";
import { IconLight, IconStop } from "../icons";
import { DotMatrix } from "./DotMatrix";
import { WorkTimeline } from "./WorkTimeline";

function useLiveElapsed(active: boolean, startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = active && startedAt != null;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [ticking]);
  if (!ticking || startedAt == null) return null;
  return formatLiveElapsed(now - startedAt);
}

export function WorkRun({
  items,
  busy = false,
  cwd = "",
  live,
  onInspectTool,
  onStop,
  runId,
  tick = 0,
  startedAt,
}: {
  items: WorkItem[];
  busy?: boolean;
  cwd?: string;
  live?: ReactNode;
  onInspectTool?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onStop?: () => void;
  runId: string;
  tick?: number;
  startedAt?: number;
}) {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const running = workRunIsLive({ items, busy });
  const copy = workRunCopy({ items, busy: running, runId, tick, locale });
  const elapsed = useLiveElapsed(running, startedAt);
  return (
    <div
      className={`work-cluster work-run${copy.failed ? " failed" : ""}${running ? " live" : ""}${open ? " open" : ""}`}
      aria-busy={running || undefined}
    >
      <div className="work-run-bar">
        <button
          type="button"
          className="work-run-head"
          aria-expanded={open}
          aria-label={copy.ariaLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="work-run-ico" aria-hidden>
            {running ? <DotMatrix /> : <IconLight size={18} />}
          </span>
          <span className="work-run-text">
            <span className={running ? "shimmer-text" : undefined}>{copy.text}</span>
            {elapsed ? <span className="work-run-elapsed">{elapsed}</span> : null}
          </span>
        </button>
        {running && onStop ? (
          <button
            type="button"
            className="work-run-stop"
            onClick={onStop}
            data-tip={t("thread.stop")}
            aria-label={t("thread.stop")}
          >
            <IconStop size={16} />
          </button>
        ) : null}
      </div>
      {open ? (
        <WorkTimeline
          items={items}
          busy={running}
          cwd={cwd}
          live={running ? live : null}
          onInspectTool={onInspectTool}
        />
      ) : null}
    </div>
  );
}
