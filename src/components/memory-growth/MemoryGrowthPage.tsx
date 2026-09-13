import { useEffect, useState } from "react";
import { openPath, readMemoryHost, readTextFile, writeAllowedText } from "../../api";
import { t, type Locale } from "../../lib/i18n";
import { friendlyError } from "../../lib/error-copy";
import { parseMemoryState } from "../../lib/memory-state";
import { countHits, memorySearchHits } from "../../lib/memory-search";
import type { DiaryEntry, OverlayStatus } from "../../lib/memory-view";
import type { AgentId } from "../../lib/agent-id";
import { useMemoryGrowth } from "../../hooks/useMemoryGrowth";
import { IconEdit, IconFinder, IconSearch } from "../../icons";
import { HighlightText } from "../HighlightText";
import { MemoryEditor } from "../MemoryEditor";
import { GrowthDiaryPaper } from "./GrowthDiaryPaper";
import { GrowthHeader } from "./GrowthHeader";
import { GrowthHeatmap } from "./GrowthHeatmap";
import { GrowthTimeline, eventLabel } from "./GrowthTimeline";
import { GrowthToggle } from "./GrowthToggle";

export type SkillProposalRow = { id: string; title: string; evidence: string };

export type MemoryGrowthPageProps = {
  locale: Locale;
  displayName: string;
  tagline: string | null;
  diary: DiaryEntry[];
  status: OverlayStatus;
  corpus: string | null;
  onDreamNow: () => void;
  onFoundingNow?: () => void;
  foundingAt?: number | null;
  proposals?: SkillProposalRow[];
  onProposalApprove?: (id: string) => void;
  onProposalDismiss?: (id: string) => void;
  userMdPath?: string;
  dreamsMdPath?: string;
  memoryPath?: string;
  agentsPath?: string;
  cwd?: string;
  onOpenPath: (path: string) => void;
  onOpenSettings?: () => void;
  extraOpen: boolean;
};

const AGENT_LABEL: Record<AgentId, string> = {
  grok: "Grok",
  kimi: "Kimi",
  claude: "Claude",
  codex: "Codex",
  devin: "Devin",
};

function statusLine(status: OverlayStatus, locale: Locale): string {
  switch (status.kind) {
    case "founding":
      return t(locale, "memory.statusFounding");
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

export function MemoryGrowthPage({
  locale,
  displayName,
  tagline,
  diary,
  status,
  corpus,
  onDreamNow,
  onFoundingNow,
  foundingAt,
  proposals,
  onProposalApprove,
  onProposalDismiss,
  userMdPath,
  dreamsMdPath,
  memoryPath,
  agentsPath,
  cwd,
  onOpenPath,
  onOpenSettings,
  extraOpen,
}: MemoryGrowthPageProps) {
  const g = useMemoryGrowth({ diary, extraOpen });
  const [menuOpen, setMenuOpen] = useState(false);
  const [hostFoundingAt, setHostFoundingAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!extraOpen || foundingAt !== undefined) return;
    void readMemoryHost()
      .then((snap) => {
        try {
          const raw = snap.stateJson?.trim() ? JSON.parse(snap.stateJson) : {};
          setHostFoundingAt(parseMemoryState(raw).foundingAt);
        } catch {
          setHostFoundingAt(null);
        }
      })
      .catch(() => setHostFoundingAt(null));
  }, [extraOpen, foundingAt]);

  const resolvedFoundingAt = foundingAt !== undefined ? foundingAt : hostFoundingAt;
  const busy = status.kind === "running" || status.kind === "founding";
  const pending = proposals ?? [];
  const q = query.trim();
  const fileRows = [
    { heading: "MEMORY.md", path: memoryPath, editable: true },
    { heading: "AGENTS.md", path: agentsPath, editable: true },
    { heading: "USER.md", path: userMdPath, editable: false },
    { heading: "DREAMS.md", path: dreamsMdPath, editable: false },
  ].filter((r): r is { heading: string; path: string; editable: boolean } => Boolean(r.path));
  const visibleFiles = q
    ? fileRows.filter((r) => countHits(`${r.heading} ${r.path}`, q) > 0)
    : fileRows;
  const hitCount = memorySearchHits({
    diary,
    days: g.timeline,
    files: fileRows,
    query: q,
    labelFor: (ev) => eventLabel(locale, ev),
  });

  return (
    <div className="memory-growth">
      <GrowthHeader
        locale={locale}
        displayName={displayName}
        tagline={tagline}
        companions={g.companions}
        sessions={g.sessionsTotal}
        streak={g.streak}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onCloseMenu={() => setMenuOpen(false)}
        primary={
          <button type="button" className="btn primary" disabled={busy} onClick={onDreamNow}>
            {t(locale, "memory.growth.dreamNow")}
          </button>
        }
      >
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => { if (busy) return; setMenuOpen(false); onFoundingNow?.(); }}
        >
          {t(locale, resolvedFoundingAt ? "memory.growth.foundingAgain" : "memory.growth.foundingNow")}
        </button>
        {onOpenSettings ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
            {t(locale, "memory.growth.mcpSettings")}
          </button>
        ) : null}
      </GrowthHeader>

      <p className="growth-stats growth-status">
        {statusLine(status, locale)}
        {corpus ? ` · ${corpus}` : ""}
      </p>

      <div className="growth-search">
        <IconSearch size={14} />
        <input
          type="search"
          value={query}
          placeholder={t(locale, "memory.growth.searchPh")}
          aria-label={t(locale, "memory.growth.searchAria")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setQuery("");
            }
          }}
        />
        {q ? (
          <span className="growth-search-count">
            {t(locale, "memory.growth.searchCount", { n: hitCount })}
          </span>
        ) : null}
      </div>

      <GrowthToggle locale={locale} metric={g.metric} onChange={g.setMetric} />
      <GrowthHeatmap
        locale={locale}
        grid={g.grid}
        selectedDay={g.selectedDay}
        onSelect={g.setSelectedDay}
      />

      {g.empty ? (
        <div className="growth-empty">
          <p>{t(locale, "memory.growth.empty")}</p>
        </div>
      ) : (
        <section className="growth-log" aria-label={t(locale, "memory.growth.log")}>
          <header className="growth-log-head">
            <strong>{t(locale, "memory.growth.log")}</strong>
            <span>{t(locale, "memory.growth.logHint")}</span>
          </header>
          <div className="growth-log-body">
            <GrowthDiaryPaper locale={locale} entries={diary} selectedDay={g.selectedDay} query={q} />
            <GrowthTimeline
              locale={locale}
              days={g.timeline}
              selectedDay={g.selectedDay}
              onSelect={g.setSelectedDay}
              query={q}
            />
          </div>
        </section>
      )}

      {pending.length > 0 ? (
        <section className="growth-log" aria-label={t(locale, "memory.growth.proposals")}>
          <header className="growth-log-head">
            <strong>{t(locale, "memory.growth.proposals")}</strong>
          </header>
          <ul className="growth-proposals">
            {pending.map((row) => (
              <li key={row.id}>
                <div className="growth-proposal-main">
                  <strong>{row.title}</strong>
                  {row.evidence ? <p>{row.evidence}</p> : null}
                </div>
                <div className="set-actions">
                  <button type="button" className="btn primary" onClick={() => onProposalApprove?.(row.id)}>
                    {t(locale, "memory.growth.proposalApprove")}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => onProposalDismiss?.(row.id)}>
                    {t(locale, "memory.growth.proposalDismiss")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="growth-files" aria-label={t(locale, "memory.projectFiles")}>
        <header className="growth-log-head">
          <strong>{t(locale, "memory.projectFiles")}</strong>
        </header>
        <ul className="hub-rows">
          {visibleFiles.map((row) =>
            row.editable ? (
              <EditableDocRow
                key={row.path}
                heading={row.heading}
                path={row.path}
                cwd={cwd}
                locale={locale}
                onOpen={onOpenPath}
                query={q}
              />
            ) : (
              <li key={row.path} className="hub-row">
                <button type="button" className="hub-row-main" onClick={() => onOpenPath(row.path)}>
                  <strong>
                    <HighlightText text={row.heading} query={q} />
                  </strong>
                  <span className="hub-meta">
                    <HighlightText text={row.path} query={q} />
                  </span>
                </button>
                <div className="hub-row-side">
                  <button
                    type="button"
                    className="file-open"
                    onClick={() => void openPath(row.path)}
                    aria-label={t(locale, "finder.open")}
                  >
                    <IconFinder size={14} />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}

function EditableDocRow({
  heading,
  path,
  cwd,
  locale,
  onOpen,
  query = "",
}: {
  heading: string;
  path: string;
  cwd?: string;
  locale: Locale;
  onOpen: (path: string) => void;
  query?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function beginEdit() {
    try {
      const row = await readTextFile(path, cwd || null);
      setText(row.text);
      setSaved(row.text);
      setEditing(true);
      setNote(null);
    } catch (e) {
      setNote(friendlyError(e));
    }
  }

  async function save() {
    try {
      await writeAllowedText(path, text, cwd || null);
      setSaved(text);
      setNote(t(locale, "toast.saved"));
    } catch (e) {
      setNote(friendlyError(e));
    }
  }

  return (
    <li className="hub-row growth-file-row">
      <button type="button" className="hub-row-main" onClick={() => onOpen(path)}>
        <strong>
          <HighlightText text={heading} query={query} />
        </strong>
        <span className="hub-meta">
          <HighlightText text={path} query={query} />
        </span>
      </button>
      <div className="hub-row-side">
        <button
          type="button"
          className="file-open"
          onClick={() => (editing ? setEditing(false) : void beginEdit())}
          aria-label={editing ? t(locale, "hub.collapse") : t(locale, "preview.edit")}
        >
          <IconEdit size={14} />
        </button>
        <button
          type="button"
          className="file-open"
          onClick={() => void openPath(path)}
          aria-label={t(locale, "finder.open")}
        >
          <IconFinder size={14} />
        </button>
      </div>
      {editing ? (
        <div className="growth-file-editor">
          <MemoryEditor
            path={path}
            text={text}
            dirty={text !== saved}
            onChange={setText}
            onSave={() => void save()}
            onReveal={() => void openPath(path)}
          />
        </div>
      ) : null}
      {note ? <p className="set-note">{note}</p> : null}
    </li>
  );
}
