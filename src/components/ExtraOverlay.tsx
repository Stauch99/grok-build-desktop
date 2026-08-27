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
  usagePoints,
  usageDays,
  onUsageDays,
  subagents,
}: ExtraOverlayProps) {
  if (!page) return null;

  return (
    <div className="settings-layer" role="presentation">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-dialog extra-dialog" role="dialog" aria-modal="true" aria-label={TITLES[page]}>
        <header className="settings-head">
          <strong>{TITLES[page]}</strong>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="关闭">
            关闭
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
            />
          ) : null}
          {page === "dashboard" ? <DashboardPanel sessions={dashboard} onOpen={onOpenSession} /> : null}
          {page === "agents" ? <AgentsPage agents={agents} onOpen={onOpenPath} onSlash={onSlash} /> : null}
          {page === "memory" ? (
            <MemoryWorkspace
              memoryPath={memoryPath}
              agentsPath={agentsPath}
              cwd={cwd}
              onOpen={onOpenPath}
              onEdit={onOpenPath}
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
