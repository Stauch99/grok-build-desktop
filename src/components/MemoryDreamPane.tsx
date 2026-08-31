import { useState } from "react";
import type { AgentId } from "../lib/agent-id";
import { t, type Locale } from "../lib/i18n";
import { selectedDiary, type DiaryEntry, type OverlayStatus } from "../lib/memory-view";

const AGENT_LABEL: Record<AgentId, string> = {
  grok: "Grok",
  kimi: "Kimi",
  claude: "Claude",
  codex: "Codex",
};

export type MemoryDreamPaneProps = {
  entries: DiaryEntry[];
  status: OverlayStatus;
  corpus?: string | null;
  onDreamNow: () => void;
  onOpenUserMd: () => void;
  locale?: Locale;
};

export function MemoryDreamPane({
  entries,
  status,
  corpus,
  onDreamNow,
  onOpenUserMd,
  locale = "zh",
}: MemoryDreamPaneProps) {
  const [date, setDate] = useState<string | null>(null);
  const entry = selectedDiary(entries, date);

  return (
    <div className="memory-dream-pane">
      <div className="memory-dream-left">
        {entry ? (
          <>
            <h3>{entry.date}</h3>
            {entry.body ? <div className="memory-dream-body">{entry.body}</div> : null}
          </>
        ) : null}
        <p className="memory-dream-status">{statusLine(status, locale)}</p>
        {corpus ? <p className="memory-dream-corpus">{corpus}</p> : null}
        <div className="memory-dream-actions">
          <button
            type="button"
            className="btn"
            disabled={status.kind === "running"}
            onClick={onDreamNow}
          >
            {t(locale, "memory.dreamNow")}
          </button>
          <button type="button" className="btn ghost" onClick={onOpenUserMd}>
            {t(locale, "memory.openUserMd")}
          </button>
        </div>
      </div>
      <div className="memory-dream-timeline">
        {entries.map((e) => (
          <button
            key={e.date}
            type="button"
            className={entry?.date === e.date ? "active" : undefined}
            onClick={() => setDate(e.date)}
          >
            {e.date}
          </button>
        ))}
      </div>
    </div>
  );
}

function statusLine(status: OverlayStatus, locale: Locale): string {
  switch (status.kind) {
    case "running":
      return t(locale, "memory.statusRunning");
    case "failed":
      return t(locale, "memory.statusFailed");
    case "blocked-login":
      return t(locale, "memory.statusBlocked").replace("{agent}", AGENT_LABEL[status.agentId]);
    case "pending":
      return t(locale, "memory.statusPending").replace("{n}", String(status.sessionCount));
    case "idle": {
      const when =
        status.lastAt == null
          ? "—"
          : new Date(status.lastAt).toLocaleString(locale === "en" ? "en" : "zh-CN");
      return t(locale, "memory.statusIdle").replace("{when}", when);
    }
  }
}
