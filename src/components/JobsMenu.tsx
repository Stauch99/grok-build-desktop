import { useEffect, useRef } from "react";
import type { HeaderJob } from "../lib/jobs-header";
import { useT } from "../lib/locale-context";
import { IconStop } from "../icons";

export type JobsMenuProps = {
  jobs: HeaderJob[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onInspect: (job: HeaderJob) => void;
  onStop: (job: HeaderJob) => void;
  sessionHint?: Record<string, string>;
  currentSessionId?: string | null;
};

export function JobsMenu({
  jobs,
  open,
  onToggle,
  onClose,
  onInspect,
  onStop,
  sessionHint,
  currentSessionId,
}: JobsMenuProps) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  if (jobs.length === 0) return null;

  return (
    <div className="chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        {t("jobs.count", { n: jobs.length })}
      </button>
      {open ? (
        <div className="chip-menu jobs-menu" role="menu">
          {jobs.map((job) => {
            const hint =
              job.sessionId && job.sessionId !== currentSessionId ? sessionHint?.[job.sessionId] : undefined;
            return (
              <div key={`${job.paneId}:${job.id}`} className="jobs-row" role="none">
                <button
                  type="button"
                  className="jobs-inspect"
                  role="menuitem"
                  onClick={() => onInspect(job)}
                >
                  <span className="menu-hint-label">{job.title}</span>
                  {hint ? <span className="menu-hint-text">{hint}</span> : null}
                </button>
                <button
                  type="button"
                  className="jobs-stop"
                  role="menuitem"
                  onClick={() => onStop(job)}
                  data-tip={t("thread.stop")}
                  aria-label={t("thread.stop")}
                >
                  <IconStop size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
