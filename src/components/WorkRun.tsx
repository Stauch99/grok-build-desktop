import { useState, type ReactNode } from "react";
import type { WorkItem } from "../lib/chat";
import { workRunCopy } from "../lib/work-run";
import { useLocale, useT } from "../lib/locale-context";
import { IconLight, IconStop } from "../icons";
import { DotMatrix } from "./DotMatrix";
import { WorkTimeline } from "./WorkTimeline";

export function WorkRun({
  items,
  busy = false,
  cwd = "",
  live,
  onInspectTool,
  onStop,
  runId,
  tick = 0,
}: {
  items: WorkItem[];
  busy?: boolean;
  cwd?: string;
  live?: ReactNode;
  onInspectTool?: (item: Extract<WorkItem, { kind: "tool" }>) => void;
  onStop?: () => void;
  runId: string;
  tick?: number;
}) {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const copy = workRunCopy({ items, busy, runId, tick, locale });
  return (
    <div className={`work-cluster work-run${copy.failed ? " failed" : ""}${busy ? " live" : ""}${open ? " open" : ""}`}>
      <div className="work-run-bar">
        <button
          type="button"
          className="work-run-head"
          aria-expanded={open}
          aria-label={copy.ariaLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="work-run-ico" aria-hidden>
            {busy ? <DotMatrix /> : <IconLight size={18} />}
          </span>
          <span className="work-run-text">{copy.text}</span>
        </button>
        {busy && onStop ? (
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
          busy={busy}
          cwd={cwd}
          live={busy ? live : null}
          onInspectTool={onInspectTool}
        />
      ) : null}
    </div>
  );
}
