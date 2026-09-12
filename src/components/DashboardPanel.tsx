import { AgentIcon } from "../lib/agent-icons";
import { useT } from "../lib/locale-context";
import type { DashboardSession } from "../lib/app-view";
import type { SessionStatus } from "../lib/session-status";
import { formatTokenCount, sessionAgentPill } from "../lib/sidebar-list";
import { basename, relativeTime } from "../lib/text";

export type { DashboardSession } from "../lib/app-view";

export type DashboardPanelProps = {
  sessions: DashboardSession[];
  onOpen: (id: string) => void;
};

/**
 * Status is derived from runtime facts, not user-managed — so the board is
 * read-only. Dragging a derived state would be a fake affordance.
 */
const COLUMNS: Array<{
  id: string;
  key: string;
  match: (status: SessionStatus) => boolean;
}> = [
  {
    id: "needs-you",
    key: "dashboard.needsYou",
    match: (s) => s === "needs-you" || s === "error",
  },
  { id: "working", key: "dashboard.running", match: (s) => s === "working" },
  { id: "done", key: "dashboard.done", match: (s) => s === "done" },
  { id: "idle", key: "dashboard.idle", match: (s) => s === "idle" },
];

function ColumnBody({ rows, onOpen }: { rows: DashboardSession[]; onOpen: (id: string) => void }) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="kanban-empty">{t("dashboard.colEmpty")}</p>;
  }
  return (
    <>
      {rows.map((s) => {
        const pill = sessionAgentPill(s.agentId);
        const foot = [
          relativeTime(s.updatedAt),
          s.numMessages > 0 ? t("dashboard.msgs", { n: s.numMessages }) : "",
          s.tokens ? `${formatTokenCount(s.tokens)} tok` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={s.id}
            type="button"
            className="kanban-card"
            data-status={s.status}
            onClick={() => onOpen(s.id)}
          >
            <strong className="kanban-card-title">{s.title || t("dashboard.untitled")}</strong>
            <span className="kanban-card-meta">
              <AgentIcon id={pill.agentId} size={14} />
              <span className="kanban-card-proj">{basename(s.cwd)}</span>
            </span>
            {foot ? <span className="kanban-card-foot">{foot}</span> : null}
          </button>
        );
      })}
    </>
  );
}

/**
 * /dashboard: sessions as cards on a status kanban — Needs you / Running /
 * For review / Idle. Awareness surface; management stays in the sidebar.
 */
export function DashboardPanel({ sessions, onOpen }: DashboardPanelProps) {
  const t = useT();

  if (sessions.length === 0) {
    return <p className="float-empty">{t("dashboard.empty")}</p>;
  }

  return (
    <div className="kanban">
      {COLUMNS.map((col) => {
        const rows = sessions.filter((s) => col.match(s.status));
        return (
          <section key={col.id} className="kanban-col" data-col={col.id}>
            <header className="kanban-col-head">
              <strong>{t(col.key)}</strong>
              <span className="kanban-count">{rows.length}</span>
            </header>
            <div className="kanban-col-body">
              <ColumnBody rows={rows} onOpen={onOpen} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
