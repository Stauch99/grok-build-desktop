import { useEffect } from "react";
import { IconGrokClose } from "../grok-icons";
import type { Locale } from "../lib/i18n";
import type { DiaryEntry, OverlayStatus } from "../lib/memory-view";
import { AgentsPage, type AgentEntry } from "./AgentsPage";
import { DashboardPanel, type DashboardSession } from "./DashboardPanel";
import { ImagineGallery } from "./ImagineGallery";
import { MemoryWorkspace } from "./MemoryWorkspace";
import { ParallelSubagents, type ParallelSubagentItem } from "./ParallelSubagents";
import { TokenChart } from "./TokenChart";

export type ExtraPage =
  | "imagine"
  | "imagine-video"
  | "dashboard"
  | "agents"
  | "memory"
  | "usage";

const TITLES: Record<ExtraPage, string> = {
  imagine: "图片",
  "imagine-video": "视频",
  dashboard: "会话总览",
  agents: "代理",
  memory: "记忆",
  usage: "用量",
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
  userMdPath?: string;
  usagePoints: { at: number; used: number; size: number }[];
  usageDays: 7 | 30;
  onUsageDays: (d: 7 | 30) => void;
  subagents: ParallelSubagentItem[];
};

/**
 * Extra pages that actually list files or sessions. Slash-only doors stay on the CLI.
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
  userMdPath,
  usagePoints,
  usageDays,
  onUsageDays,
  subagents,
}: ExtraOverlayProps) {
  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onClose]);

  if (!page) return null;

  return (
    <div className="settings-layer" role="presentation">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-dialog extra-dialog" role="dialog" aria-modal="true" aria-label={TITLES[page]}>
        <header className="settings-head">
          <strong>{TITLES[page]}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭" title="关闭">
            <IconGrokClose size={16} />
          </button>
        </header>
        <div className="settings-body">
          {page === "imagine" || page === "imagine-video" ? (
            <ImagineGallery
              images={images}
              videos={videos}
              onOpen={onOpenPath}
              onSlash={onSlash}
              mode={page === "imagine-video" ? "video" : "image"}
              cwd={cwd}
            />
          ) : null}
          {page === "dashboard" ? <DashboardPanel sessions={dashboard} onOpen={onOpenSession} /> : null}
          {page === "agents" ? <AgentsPage agents={agents} onOpen={onOpenPath} /> : null}
          {page === "memory" ? (
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
          {page === "usage" ? (
            <TokenChart points={usagePoints} days={usageDays} onDays={onUsageDays} />
          ) : null}
          {subagents.length > 0 && page === "dashboard" ? (
            <ParallelSubagents items={subagents} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
