import { useState } from "react";
import { t, type Locale } from "../../lib/i18n";
import type { DiaryEntry, OverlayStatus } from "../../lib/memory-view";
import { useMemoryGrowth } from "../../hooks/useMemoryGrowth";
import { MemoryWorkspace } from "../MemoryWorkspace";
import { GrowthDiaryPaper } from "./GrowthDiaryPaper";
import { GrowthHeader } from "./GrowthHeader";
import { GrowthHeatmap } from "./GrowthHeatmap";
import { GrowthTimeline } from "./GrowthTimeline";
import { GrowthToggle } from "./GrowthToggle";

export type MemoryGrowthPageProps = {
  locale: Locale;
  displayName: string;
  tagline: string | null;
  diary: DiaryEntry[];
  status: OverlayStatus;
  corpus: string | null;
  onDreamNow: () => void;
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
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDreamNow(); }}>
          {t(locale, "memory.growth.dreamNow")}
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
          <button type="button" className="btn" onClick={onDreamNow} disabled={status.kind === "running"}>
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
