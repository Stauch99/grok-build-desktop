import { useEffect, useMemo, useState } from "react";
import { IconGrokClose } from "../grok-icons";
import type { DashboardSession } from "../lib/app-view";
import { sameCwd } from "../lib/inbox";
import { useT } from "../lib/locale-context";
import { basename } from "../lib/text";
import { DashboardPanel } from "./DashboardPanel";
import { ParallelSubagents, type ParallelSubagentItem } from "./ParallelSubagents";

export type DashboardPageProps = {
  sessions: DashboardSession[];
  subagents?: ParallelSubagentItem[];
  inboxCwd?: string;
  onOpen: (id: string) => void;
  onClose: () => void;
};

type ProjectChip = { cwd: string; label: string; count: number };

/**
 * The session overview as a full page over the workspace main area — the
 * workspace stays mounted underneath so returning keeps scroll and drafts.
 */
export function DashboardPage({
  sessions,
  subagents = [],
  inboxCwd,
  onOpen,
  onClose,
}: DashboardPageProps) {
  const t = useT();
  const [filter, setFilter] = useState<string | null>(null);

  const projects = useMemo<ProjectChip[]>(() => {
    const seen: ProjectChip[] = [];
    for (const s of sessions) {
      const hit = seen.find((p) => sameCwd(p.cwd, s.cwd));
      if (hit) {
        hit.count += 1;
      } else {
        seen.push({
          cwd: s.cwd,
          label: inboxCwd && sameCwd(s.cwd, inboxCwd) ? t("sidebar.inbox") : basename(s.cwd),
          count: 1,
        });
      }
    }
    return seen;
  }, [sessions, inboxCwd, t]);

  const active = filter && projects.some((p) => sameCwd(p.cwd, filter)) ? filter : null;
  const filtered = active ? sessions.filter((s) => sameCwd(s.cwd, active)) : sessions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dashboard-page" role="main" aria-label={t("extra.dashboard")}>
      <header className="dash-head">
        <strong className="dash-title">{t("extra.dashboard")}</strong>
        {projects.length > 1 ? (
          <div className="kanban-filter" role="group" aria-label={t("dashboard.filter")}>
            <button
              type="button"
              className={active === null ? "on" : ""}
              onClick={() => setFilter(null)}
            >
              <span className="kanban-filter-label">{t("dashboard.allProjects")}</span>
              <span className="kanban-count">{sessions.length}</span>
            </button>
            {projects.map((p) => (
              <button
                key={p.cwd}
                type="button"
                className={active === p.cwd ? "on" : ""}
                data-tip={p.cwd}
                onClick={() => setFilter(p.cwd)}
              >
                <span className="kanban-filter-label">{p.label}</span>
                <span className="kanban-count">{p.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="icon-btn dash-close" onClick={onClose} aria-label={t("common.close")}>
          <IconGrokClose size={16} />
        </button>
      </header>
      <div className="dash-body">
        {subagents.length > 0 ? <ParallelSubagents items={subagents} /> : null}
        <DashboardPanel sessions={filtered} onOpen={onOpen} />
      </div>
    </div>
  );
}
