import { useEffect, useState } from "react";
import { readMemoryHost } from "../../api";
import { t, type Locale } from "../../lib/i18n";
import { parseMemoryState } from "../../lib/memory-state";
import type { DiaryEntry, OverlayStatus } from "../../lib/memory-view";
import { useMemoryGrowth } from "../../hooks/useMemoryGrowth";
import { MemoryWorkspace } from "../MemoryWorkspace";
import { GrowthDiaryPaper } from "./GrowthDiaryPaper";
import { GrowthHeader } from "./GrowthHeader";
import { GrowthHeatmap } from "./GrowthHeatmap";
import { GrowthTimeline } from "./GrowthTimeline";
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
  const [filesOpen, setFilesOpen] = useState(false);
  const [hostFoundingAt, setHostFoundingAt] = useState<number | null>(null);

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
      >
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => { if (busy) return; setMenuOpen(false); onDreamNow(); }}
        >
          {t(locale, "memory.growth.dreamNow")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => { if (busy) return; setMenuOpen(false); onFoundingNow?.(); }}
        >
          {t(locale, resolvedFoundingAt ? "memory.growth.foundingAgain" : "memory.growth.foundingNow")}
        </button>
        {userMdPath ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenPath(userMdPath); }}>
            {t(locale, "memory.openUserMd")}
          </button>
        ) : null}
        {dreamsMdPath ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenPath(dreamsMdPath); }}>
            {t(locale, "memory.growth.openDreams")}
          </button>
        ) : null}
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setFilesOpen(true); }}>
          {t(locale, "memory.projectFiles")}
        </button>
        {onOpenSettings ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
            {t(locale, "memory.growth.mcpSettings")}
          </button>
        ) : null}
      </GrowthHeader>

      {status.kind === "founding" ? (
        <p className="growth-stats">{t(locale, "memory.statusFounding")}</p>
      ) : status.kind === "running" ? (
        <p className="growth-stats">{t(locale, "memory.statusRunning")}</p>
      ) : null}

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
          <button type="button" className="btn" onClick={onDreamNow} disabled={busy}>
            {t(locale, "memory.growth.dreamNow")}
          </button>
        </div>
      ) : (
        <section className="growth-log" aria-label={t(locale, "memory.growth.log")}>
          <header className="growth-log-head">
            <strong>{t(locale, "memory.growth.log")}</strong>
            <span>{t(locale, "memory.growth.logHint")}</span>
          </header>
          <div className="growth-log-body">
            <GrowthDiaryPaper locale={locale} entries={diary} selectedDay={g.selectedDay} />
            <GrowthTimeline
              locale={locale}
              days={g.timeline}
              selectedDay={g.selectedDay}
              onSelect={g.setSelectedDay}
            />
          </div>
        </section>
      )}

      {pending.length > 0 ? (
        <section className="growth-log" aria-label={t(locale, "memory.growth.proposals")}>
          <header className="growth-log-head">
            <strong>{t(locale, "memory.growth.proposals")}</strong>
          </header>
          <ul>
            {pending.map((row) => (
              <li key={row.id}>
                <strong>{row.title}</strong>
                {row.evidence ? <p>{row.evidence}</p> : null}
                <button type="button" className="btn" onClick={() => onProposalApprove?.(row.id)}>
                  {t(locale, "memory.growth.proposalApprove")}
                </button>
                <button type="button" className="btn ghost" onClick={() => onProposalDismiss?.(row.id)}>
                  {t(locale, "memory.growth.proposalDismiss")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filesOpen ? (
        <MemoryWorkspace
          memoryPath={memoryPath}
          agentsPath={agentsPath}
          cwd={cwd}
          onOpen={onOpenPath}
          onEdit={onOpenPath}
          diary={diary}
          status={status}
          corpus={corpus}
          onDreamNow={onDreamNow}
          onOpenUserMd={userMdPath ? () => onOpenPath(userMdPath) : undefined}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
