import { useCallback, useEffect, useRef } from "react";
import { saveWebuiState, type WebuiState } from "../api";
import type { AgentId } from "../lib/agent-id";
import type { Locale } from "../lib/i18n";
import { WEBUI_PERSIST_MS } from "../lib/persist-cache";
import type { Mode } from "../lib/mode";
import type { UnreadMap } from "../lib/session-status";
import type { SidebarListPrefs } from "../lib/sidebar-list";
import type { ProjectGroupState } from "../lib/project-groups";

export { WEBUI_PERSIST_MS };

export type WebuiSnapshot = {
  projects: string[];
  theme: "light" | "dark";
  mode: Mode;
  chatWidth: number;
  titles: Record<string, string>;
  inboxCwd: string;
  chatFontSize: number;
  pinned: string[];
  archived: string[];
  drafts: Record<string, string>;
  enterSends: boolean;
  autoArchiveDays: number;
  filePanelOpen: boolean;
  steerByDefault: boolean;
  unread: UnreadMap;
  sidebarWidth: number;
  previewWidth: number;
  locale: Locale;
  themeFamily: "default" | "paper" | "ink" | "frost";
  accentId: string;
  hideToTray: boolean;
  defaultRail: "tasks" | "changes" | "context";
  shortcuts: Record<string, string>;
  lastWorkspace: string;
  pinnedProjects: string[];
  projectGroups: ProjectGroupState;
  sessionTokens: Record<string, number>;
  sidebarList: SidebarListPrefs;
  injectUserMemory?: boolean;
  dreamingEnabled?: boolean;
  dreamAgentId?: AgentId;
  dreamThresholdSessions?: number;
  memoryMcpEnabled?: boolean;
  memoryDisplayName?: string;
  lastAgent?: AgentId;
  manualProjects?: boolean;
  sounds?: boolean;
  allowedTools?: string[];
};

export function buildWebuiState(snapshot: WebuiSnapshot, partial: WebuiState = {}): WebuiState {
  return { ...snapshot, ...partial };
}

export function accumulatePersistPartial(pending: WebuiState, incoming: WebuiState): WebuiState {
  return { ...pending, ...incoming };
}

export function flushWebuiPersist(snapshot: WebuiSnapshot, pending: WebuiState): WebuiState {
  return buildWebuiState(snapshot, pending);
}

export function useWebuiPersist(snapshot: WebuiSnapshot): (partial: WebuiState) => void {
  const timer = useRef<number | null>(null);
  const snapRef = useRef(snapshot);
  const pendingRef = useRef<WebuiState>({});
  snapRef.current = snapshot;
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);
  return useCallback((partial: WebuiState) => {
    pendingRef.current = accumulatePersistPartial(pendingRef.current, partial);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const next = flushWebuiPersist(snapRef.current, pendingRef.current);
      pendingRef.current = {};
      void saveWebuiState(next);
    }, WEBUI_PERSIST_MS);
  }, []);
}
