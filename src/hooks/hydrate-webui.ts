import {
  doctor,
  ensureInbox,
  listSessions,
  loadWebuiState,
  pathIsDir,
  readCliSettings,
  type CliSettings,
  type DoctorInfo,
  type SessionSummary,
  type WebuiState,
} from "../api";
import { normalizeLocale, type Locale } from "../lib/i18n";
import { friendlyError } from "../lib/error-copy";
import type { InspectReport } from "../lib/inspect";
import { loadWidth, PREVIEW, SIDEBAR } from "../lib/layout";
import { parseMemorySettings } from "../lib/memory-settings";
import { adoptManualProjects, keepExistingDirs } from "../lib/projects";
import { loadProjectGroups, pruneProjectGroups, type ProjectGroupState } from "../lib/project-groups";
import { loadDrafts } from "../lib/session-drafts";
import { brandSessionList } from "../lib/session-list";
import { loadUnread, type UnreadMap } from "../lib/session-status";
import {
  loadSidebarList,
  prunePinnedProjects,
  pruneSessionTokens,
  type SidebarListPrefs,
} from "../lib/sidebar-list";
import { keepLiveAgentOnHydrate } from "../lib/session-agent";
import { migrateAllowedTools } from "../lib/permission-allow";
import type { AgentId } from "../lib/agent-id";
import { normalizeAccentId, type AccentId } from "../lib/accent";
import type { AgentDoctor } from "../lib/agent-doctor";
import type { Mode } from "../lib/mode";
import { parseThemePref, type ThemePref } from "../lib/theme-pref";
import { doctorAll, importAgentsMcpFirstOpen } from "../lib/workbench-api";
import type { Dispatch, SetStateAction } from "react";

export type HydrateWebuiDeps = {
  persist: (partial: WebuiState) => void;
  showToast: (msg: string) => void;
  applySessionUnion: (disk: SessionSummary[], inbox: string, projectPaths?: string[]) => void;
  refreshInspect: (dir?: string) => Promise<void>;
  hydrateReview: (value: { open?: boolean; defaultTab?: "tasks" | "changes" }) => void;
  agentPickedRef: { current: boolean };
  selectedAgentIdLiveRef: { current: AgentId };
  setSelectedAgentId: (id: AgentId) => void;
  setDoctors: Dispatch<SetStateAction<AgentDoctor[]>>;
  setInfo: Dispatch<SetStateAction<DoctorInfo | null>>;
  setCli: Dispatch<SetStateAction<CliSettings | null>>;
  setShowThinking: (value: boolean) => void;
  setMode: Dispatch<SetStateAction<Mode>>;
  setProjects: (paths: string[]) => void;
  setManualProjects: (value: boolean) => void;
  setTheme: (theme: ThemePref) => void;
  setChatWidth: (width: number) => void;
  setChatFontSize: (size: number) => void;
  setTitles: (titles: Record<string, string>) => void;
  setPinned: (ids: string[]) => void;
  setArchived: (ids: string[]) => void;
  setSessionDrafts: (drafts: Record<string, string>) => void;
  setEnterSends: (value: boolean) => void;
  setAutoArchiveDays: (days: number) => void;
  setSteerByDefault: (value: boolean) => void;
  setInjectUserMemory: (value: boolean) => void;
  setDreamingEnabled: (value: boolean) => void;
  setDreamAgentId: (id: AgentId) => void;
  setDreamThresholdSessions: (n: number) => void;
  setMemoryMcpEnabled: (value: boolean) => void;
  setMemoryDisplayName: (value: string) => void;
  setLocale: (locale: Locale) => void;
  setThemeFamily: (family: "default" | "paper" | "ink" | "frost") => void;
  setAccentId: (id: AccentId) => void;
  setDensity: (density: "comfortable" | "compact") => void;
  setHideToTray: (value: boolean) => void;
  setDefaultRail: (rail: "tasks" | "changes" | "context") => void;
  setShortcuts: (shortcuts: Record<string, string>) => void;
  setUnread: (unread: UnreadMap) => void;
  setSounds: (value: boolean) => void;
  setAllowedTools: Dispatch<SetStateAction<Set<string>>>;
  setSidebarWidth: (width: number) => void;
  setPreviewWidth: (width: number) => void;
  setSidebarList: Dispatch<SetStateAction<SidebarListPrefs>>;
  setLastWorkspace: (path: string) => void;
  setPinnedProjects: (paths: string[]) => void;
  setProjectGroups: (groups: ProjectGroupState) => void;
  setInboxCwd: (cwd: string) => void;
  setSessionTokens: (tokens: Record<string, number>) => void;
  setCwd: (cwd: string) => void;
  setSettingsHydrated: (value: boolean) => void;
  setInspect?: Dispatch<SetStateAction<InspectReport | null>>;
};

export async function hydrateWebuiState(d: HydrateWebuiDeps): Promise<void> {
  try {
    void doctorAll().then(d.setDoctors).catch(() => d.setDoctors([]));
    void importAgentsMcpFirstOpen().catch(() => undefined);
    const [doc, state, cliState] = await Promise.all([
      doctor(),
      loadWebuiState().catch(() => ({}) as WebuiState),
      readCliSettings().catch(() => null),
    ]);
    d.setSelectedAgentId(
      keepLiveAgentOnHydrate(d.agentPickedRef.current, state.lastAgent, d.selectedAgentIdLiveRef.current),
    );
    d.setInfo(doc);
    if (cliState) {
      d.setCli(cliState);
      d.setShowThinking(cliState.showThinking);
      if (cliState.yolo) d.setMode("yolo");
    }
    const adopted = adoptManualProjects(state.projects, state.manualProjects);
    const live = new Set<string>();
    await Promise.all(
      adopted.projects.map(async (p) => {
        if (await pathIsDir(p).catch(() => false)) live.add(p);
      }),
    );
    const kept = keepExistingDirs(adopted.projects, (p) => live.has(p));
    d.setProjects(kept);
    d.setManualProjects(true);
    if (adopted.reset || kept.length < adopted.projects.length || state.manualProjects !== true) {
      d.persist({
        projects: kept,
        pinnedProjects: prunePinnedProjects(
          Array.isArray(state.pinnedProjects)
            ? state.pinnedProjects.filter((p): p is string => typeof p === "string")
            : [],
          kept,
        ),
        lastWorkspace: adopted.reset ? "" : state.lastWorkspace,
        manualProjects: true,
      });
    }
    const themePref = parseThemePref(state.theme);
    if (themePref) d.setTheme(themePref);
    if (typeof state.chatWidth === "number" && state.chatWidth >= 480 && state.chatWidth <= 1100) {
      d.setChatWidth(state.chatWidth);
    }
    if (state.mode) d.setMode(state.mode);
    if (typeof state.chatFontSize === "number" && state.chatFontSize >= 14 && state.chatFontSize <= 20) {
      d.setChatFontSize(state.chatFontSize);
    }
    if (state.titles && typeof state.titles === "object") {
      const next: Record<string, string> = {};
      for (const [id, title] of Object.entries(state.titles)) {
        if (typeof title === "string" && title.trim()) next[id] = title.trim().slice(0, 80);
      }
      d.setTitles(next);
    }
    if (Array.isArray(state.pinned)) d.setPinned(state.pinned.filter((id) => typeof id === "string"));
    if (Array.isArray(state.archived)) d.setArchived(state.archived.filter((id) => typeof id === "string"));
    d.setSessionDrafts(loadDrafts(state.drafts));
    if (typeof state.enterSends === "boolean") d.setEnterSends(state.enterSends);
    if (typeof state.autoArchiveDays === "number") d.setAutoArchiveDays(state.autoArchiveDays);
    if (typeof state.filePanelOpen === "boolean") {
      d.hydrateReview({ open: state.filePanelOpen });
    }
    if (typeof state.steerByDefault === "boolean") d.setSteerByDefault(state.steerByDefault);
    const memory = parseMemorySettings(state);
    d.setInjectUserMemory(memory.injectUserMemory);
    d.setDreamingEnabled(memory.dreamingEnabled);
    d.setDreamAgentId(memory.dreamAgentId);
    d.setDreamThresholdSessions(memory.dreamThresholdSessions);
    d.setMemoryMcpEnabled(memory.memoryMcpEnabled);
    d.setMemoryDisplayName(memory.memoryDisplayName);
    d.setLocale(normalizeLocale(state.locale));
    if (state.themeFamily === "paper" || state.themeFamily === "ink" || state.themeFamily === "default" || state.themeFamily === "frost") {
      d.setThemeFamily(state.themeFamily);
    }
    d.setAccentId(normalizeAccentId(state.accentId));
    const persistedDensity = (state as WebuiState & { density?: string }).density;
    if (persistedDensity === "compact" || persistedDensity === "comfortable") d.setDensity(persistedDensity);
    if (typeof state.hideToTray === "boolean") d.setHideToTray(state.hideToTray);
    if (typeof state.sounds === "boolean") d.setSounds(state.sounds);
    if (Array.isArray(state.allowedTools)) {
      d.setAllowedTools(new Set(migrateAllowedTools(state.allowedTools.filter((k) => typeof k === "string"))));
    }
    if (state.defaultRail === "tasks" || state.defaultRail === "changes") {
      d.setDefaultRail(state.defaultRail);
      d.hydrateReview({ defaultTab: state.defaultRail });
    } else if (state.defaultRail === "context") {
      d.setDefaultRail("changes");
      d.hydrateReview({ defaultTab: "changes" });
    }
    if (state.shortcuts && typeof state.shortcuts === "object") d.setShortcuts(state.shortcuts);
    d.setUnread(loadUnread(state.unread));
    d.setSidebarWidth(loadWidth(state.sidebarWidth, SIDEBAR));
    d.setPreviewWidth(loadWidth(state.previewWidth, PREVIEW));
    d.setSidebarList(loadSidebarList(state.sidebarList));
    d.setLastWorkspace(adopted.reset ? "" : typeof state.lastWorkspace === "string" ? state.lastWorkspace : "");
    const pinnedRaw = Array.isArray(state.pinnedProjects)
      ? state.pinnedProjects.filter((p): p is string => typeof p === "string")
      : [];
    d.setPinnedProjects(prunePinnedProjects(pinnedRaw, kept));
    d.setProjectGroups(pruneProjectGroups(loadProjectGroups(state.projectGroups), kept));
    const inbox = await ensureInbox(state.inboxCwd ?? null);
    d.setInboxCwd(inbox);
    const all = brandSessionList(await listSessions(null).catch(() => [] as SessionSummary[]));
    d.applySessionUnion(all, inbox, kept);
    const tokenRaw = state.sessionTokens && typeof state.sessionTokens === "object" ? state.sessionTokens : {};
    d.setSessionTokens(pruneSessionTokens(tokenRaw, all.map((s) => s.id)));
    const initial = kept[0] || inbox;
    if (initial) d.setCwd(initial);
    void d.refreshInspect(initial || inbox);
  } catch (e) {
    d.showToast(friendlyError(e));
  } finally {
    d.setSettingsHydrated(true);
  }
}
