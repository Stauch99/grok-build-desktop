import { useCallback, useEffect, useRef } from "react";
import { saveWebuiState, type WebuiState } from "../api";
import type { AgentId } from "../lib/agent-id";
import type { Locale } from "../lib/i18n";
import { WEBUI_PERSIST_MS } from "../lib/persist-cache";
import type { Mode } from "../lib/mode";
import type { UnreadMap } from "../lib/session-status";
import type { SidebarListPrefs } from "../lib/sidebar-list";

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
  themeFamily: "default" | "paper" | "ink";
  hideToTray: boolean;
  defaultRail: "tasks" | "changes" | "context";
  shortcuts: Record<string, string>;
  lastWorkspace: string;
  pinnedProjects: string[];
  sessionTokens: Record<string, number>;
  sidebarList: SidebarListPrefs;
  injectUserMemory?: boolean;
  dreamingEnabled?: boolean;
  dreamAgentId?: AgentId;
  lastAgent?: AgentId;
  manualProjects?: boolean;
};

export function buildWebuiState(snapshot: WebuiSnapshot, partial: WebuiState = {}): WebuiState {
  return { ...snapshot, ...partial };
}

export function useWebuiPersist(snapshot: WebuiSnapshot): (partial: WebuiState) => void {
  const timer = useRef<number | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);
  return useCallback((partial: WebuiState) => {
    const next = buildWebuiState(snapRef.current, partial);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void saveWebuiState(next);
    }, WEBUI_PERSIST_MS);
  }, []);
}
