import { useEffect, useRef } from "react";
import { IconGrokClose } from "../grok-icons";
import type { Locale } from "../lib/i18n";
import { useT } from "../lib/locale-context";
import { usePresence } from "../lib/motion";
import type { DiaryEntry, OverlayStatus } from "../lib/memory-view";
import { AgentsPage, type AgentEntry } from "./AgentsPage";
import { DashboardPanel, type DashboardSession } from "./DashboardPanel";
import { ImagineGallery } from "./ImagineGallery";
import { MemoryGrowthPage } from "./memory-growth/MemoryGrowthPage";
import { ParallelSubagents, type ParallelSubagentItem } from "./ParallelSubagents";
import { TokenChart } from "./TokenChart";

export type ExtraPage =
  | "imagine"
  | "imagine-video"
  | "dashboard"
  | "agents"
  | "memory"
  | "usage";

const TITLE_KEYS: Record<ExtraPage, string> = {
  imagine: "extra.imagine",
  "imagine-video": "extra.imagineVideo",
  dashboard: "extra.dashboard",
  agents: "extra.agents",
  memory: "extra.memory",
  usage: "extra.usage",
};

export type ExtraOverlayProps = {
  page: ExtraPage | null;
  onClose: () => void;
  onSlash: (cmd: string) => void;
  onOpenPath: (path: string) => void;
  onOpenSession: (id: string) => void;
  images: string[];
  videos: string[];
  agents: AgentEntry[];
  dashboard: DashboardSession[];
  memoryPath?: string;
  agentsPath?: string;
  cwd?: string;
  locale?: Locale;
  diary?: DiaryEntry[];
  status?: OverlayStatus;
  corpus?: string | null;
  onDreamNow?: () => void;
  onFoundingNow?: () => void;
  foundingAt?: number | null;
  proposals?: { id: string; title: string; evidence: string }[];
  onProposalApprove?: (id: string) => void;
  onProposalDismiss?: (id: string) => void;
  userMdPath?: string;
  dreamsMdPath?: string;
  tagline?: string | null;
  displayName?: string;
  onOpenMemorySettings?: () => void;
  usagePoints: { at: number; used: number; size: number }[];
  usageDays: 7 | 30;
  onUsageDays: (d: 7 | 30) => void;
  subagents: ParallelSubagentItem[];
};

/**
 * Extra pages. Memory opens from Settings so it stays reachable when the
 * composer is blocked.
 */
export function ExtraOverlay({
  page,
  onClose,
  onSlash,
  onOpenPath,
  onOpenSession,
  images,
  videos,
  agents,
  dashboard,
  memoryPath,
  agentsPath,
  cwd,
  locale = "zh",
  diary = [],
  status = { kind: "idle", lastAt: null },
  corpus = null,
  onDreamNow,
  onFoundingNow,
  foundingAt,
  proposals,
  onProposalApprove,
  onProposalDismiss,
  userMdPath,
  dreamsMdPath,
  tagline = null,
  displayName = "",
  onOpenMemorySettings,
  usagePoints,
  usageDays,
  onUsageDays,
  subagents,
}: ExtraOverlayProps) {
  const t = useT();
  const { shown, leaving } = usePresence(page != null);
  const pageHold = useRef(page);
  if (page) pageHold.current = page;
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onClose]);

  const current = page ?? pageHold.current;
  if (!shown || !current) return null;
  const title = t(TITLE_KEYS[current]);

  return (
    <div className={`settings-layer${leaving ? " layer-out" : ""}`} role="presentation">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-dialog extra-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="settings-head">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <IconGrokClose size={16} />
          </button>
        </header>
        <div className="settings-body pane-in" key={current}>
          {current === "imagine" || current === "imagine-video" ? (
            <ImagineGallery
              images={images}
              videos={videos}
              onOpen={onOpenPath}
              onSlash={onSlash}
              mode={current === "imagine-video" ? "video" : "image"}
              cwd={cwd}
            />
          ) : null}
          {current === "dashboard" ? <DashboardPanel sessions={dashboard} onOpen={onOpenSession} /> : null}
          {current === "agents" ? <AgentsPage agents={agents} onOpen={onOpenPath} /> : null}
          {current === "memory" ? (
            <MemoryGrowthPage
              locale={locale}
              displayName={displayName}
              tagline={tagline}
              diary={diary}
              status={status}
              corpus={corpus}
              onDreamNow={onDreamNow ?? (() => {})}
              onFoundingNow={onFoundingNow}
              foundingAt={foundingAt}
              proposals={proposals}
              onProposalApprove={onProposalApprove}
              onProposalDismiss={onProposalDismiss}
              userMdPath={userMdPath}
              dreamsMdPath={dreamsMdPath}
              memoryPath={memoryPath}
              agentsPath={agentsPath}
              cwd={cwd}
              onOpenPath={onOpenPath}
              onOpenSettings={onOpenMemorySettings}
              extraOpen
            />
          ) : null}
          {current === "usage" ? (
            <TokenChart points={usagePoints} days={usageDays} onDays={onUsageDays} />
          ) : null}
          {subagents.length > 0 && current === "dashboard" ? (
            <ParallelSubagents items={subagents} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
