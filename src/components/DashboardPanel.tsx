import { useEffect, useRef, useState } from "react";
import { AgentIcon } from "../lib/agent-icons";
import { useLocale, useT } from "../lib/locale-context";
import type { DashboardSession } from "../lib/app-view";
import { statusLabel, type SessionStatus } from "../lib/session-status";
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

const PAGE = 60;

/** Hover delay before the card preview opens — quick flybys stay quiet. */
const PEEK_DELAY = 400;

type Peek = { s: DashboardSession; top: number; left: number };

function ColumnBody({ rows, onOpen }: { rows: DashboardSession[]; onOpen: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const [limit, setLimit] = useState(PAGE);
  const [peek, setPeek] = useState<Peek | null>(null);
  const peekTimer = useRef(0);
  // A column can swing from 500 idle cards to 0 — reset the window when the
  // set changes rather than growing DOM without bound.
  useEffect(() => setLimit(PAGE), [rows.length]);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  function disarmPeek() {
    window.clearTimeout(peekTimer.current);
    setPeek(null);
  }

  // Esc anywhere or any scroll (columns and page scroll) closes the preview.
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") disarmPeek();
    };
    const onScroll = () => disarmPeek();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [peek]);

  function armPeek(s: DashboardSession, el: HTMLElement) {
    window.clearTimeout(peekTimer.current);
    const r = el.getBoundingClientRect();
    peekTimer.current = window.setTimeout(() => {
      const left = Math.min(r.right + 8, Math.max(8, window.innerWidth - 288));
      const top = Math.min(Math.max(8, r.top), Math.max(8, window.innerHeight - 180));
      setPeek({ s, top, left });
    }, PEEK_DELAY);
  }

  if (rows.length === 0) {
    return <p className="kanban-empty">{t("dashboard.colEmpty")}</p>;
  }
  const shown = rows.slice(0, limit);
  const hidden = rows.length - shown.length;
  return (
    <>
      {shown.map((s) => {
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
            onMouseEnter={(e) => armPeek(s, e.currentTarget)}
            onMouseLeave={disarmPeek}
            onFocus={(e) => armPeek(s, e.currentTarget)}
            onBlur={disarmPeek}
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
      {hidden > 0 ? (
        <button type="button" className="kanban-more" onClick={() => setLimit((n) => n + PAGE)}>
          {t("dashboard.more", { n: hidden })}
        </button>
      ) : null}
      {peek ? <KanbanPeek peek={peek} locale={locale} /> : null}
    </>
  );
}

/** The hover card: every useful field DashboardSession already carries. */
function KanbanPeek({ peek, locale }: { peek: Peek; locale: "zh" | "en" }) {
  const t = useT();
  const s = peek.s;
  const pill = sessionAgentPill(s.agentId);
  const ms = new Date(s.updatedAt).getTime();
  const abs = Number.isNaN(ms) ? s.updatedAt : new Date(ms).toLocaleString(locale === "en" ? "en" : "zh-CN");
  const facts: Array<[string, string]> = [
    [t("dashboard.peekStatus"), statusLabel(s.status) || t("dashboard.idle")],
    [t("dashboard.peekAgent"), pill.label],
    [t("dashboard.peekUpdated"), abs],
    [t("dashboard.peekMsgs"), String(s.numMessages)],
  ];
  if (s.tokens) facts.push([t("dashboard.peekTokens"), formatTokenCount(s.tokens)]);
  return (
    <div
      className="kanban-peek"
      role="tooltip"
      aria-label={t("dashboard.peekAria")}
      style={{ top: peek.top, left: peek.left }}
    >
      <strong className="kanban-peek-title">{s.title || t("dashboard.untitled")}</strong>
      <span className="kanban-peek-cwd">{s.cwd}</span>
      <div className="kanban-peek-rows">
        {facts.map(([k, v]) => (
          <span key={k}>
            <em>{k}</em>
            {v}
          </span>
        ))}
      </div>
    </div>
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
