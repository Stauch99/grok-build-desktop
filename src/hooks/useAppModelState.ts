import { useRef, useState } from "react";
import type {
  CliSettings,
  DoctorInfo,
  PlanFile,
  RuleFile,
  SessionSearchHit,
  SessionSummary,
  WebuiState,
  WorkspaceEntry,
} from "../api";
import type { CommandDef, HubTab } from "../lib/commands";
import type { Locale } from "../lib/i18n";
import { t } from "../lib/i18n";
import { emptyCatalog, type AgentModelRow } from "../lib/agent-models";
import type { InspectReport } from "../lib/inspect";
import { MAIN_PANE, singlePane, type PaneNode, type Rect, type ResolvedDrop } from "../lib/pane-tree";
import type { ConfirmState } from "../lib/confirm";
import { emptyQueue, type QueueState } from "../lib/prompt-queue";
import { PREVIEW, SIDEBAR } from "../lib/layout";
import type { AgentDoctor } from "../lib/agent-doctor";
import type { GoalView } from "../lib/goal-bar";
import type { PermissionPane } from "../lib/permission-view";
import type { PaneMentionData } from "../lib/pane-mentions";
import type { UnreadMap } from "../lib/session-status";
import { displayTitle } from "../lib/projects";
import { DEFAULT_SIDEBAR_LIST } from "../lib/sidebar-list";
import { EMPTY_PROJECT_GROUPS, type ProjectGroupState } from "../lib/project-groups";
import type { SessionMenuState } from "../SessionMenu";
import type { ExtraPage } from "../components/ExtraOverlay";
import type { ComposerHandle } from "../components/Composer";
import type { MemoryChange } from "../lib/memory-dock";
import type { WeeklyUsage } from "../lib/weekly-usage";
import type { Mode } from "../lib/mode";
import type { AgentId } from "../lib/agent-id";
import { DEFAULT_ACCENT_ID, type AccentId } from "../lib/accent";
import { DEFAULT_MEMORY_SETTINGS } from "../lib/memory-settings";
import type { ExtraPaneState } from "./useAcpSession";
import type { AppConfirm } from "./useAppWorkspace";

const FALLBACK_CATALOG = emptyCatalog("grok");

export function useAppModelState() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>("skills");
  const [locale, setLocale] = useState<Locale>("zh");
  const [themeFamily, setThemeFamily] = useState<"default" | "paper" | "ink">("default");
  const [accentId, setAccentId] = useState<AccentId>(DEFAULT_ACCENT_ID);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [hideToTray, setHideToTray] = useState(true);
  const [defaultRail, setDefaultRail] = useState<"tasks" | "changes" | "context">("tasks");
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [inspect, setInspect] = useState<InspectReport | null>(null);
  const [modelRows, setModelRows] = useState<AgentModelRow[]>(FALLBACK_CATALOG.models);
  const [effort, setEffort] = useState(FALLBACK_CATALOG.currentEffort);
  const [effortReady, setEffortReady] = useState(false);
  const [extraPage, setExtraPage] = useState<ExtraPage | null>(null);
  const [imagineImages, setImagineImages] = useState<string[]>([]);
  const [imagineVideos, setImagineVideos] = useState<string[]>([]);
  const [agentRows, setAgentRows] = useState<{ name: string; path: string; kind: "agent" | "persona" }[]>([]);
  const [managed, setManaged] = useState<{ path: string; text: string; exists: boolean } | null>(null);
  const [usageHistory, setUsageHistory] = useState<{ at: number; used: number; size: number }[]>([]);
  const [appConfirm, setAppConfirm] = useState<AppConfirm | null>(null);
  const cancelArmRef = useRef<ConfirmState | null>(null);
  const [usageDays, setUsageDays] = useState<7 | 30>(7);
  const [jumpTurnId, setJumpTurnId] = useState<string | null>(null);
  const [doctorNote, setDoctorNote] = useState<string | null>(null);
  const [sawExit, setSawExit] = useState(false);
  const [threadView, setThreadView] = useState<"chat" | "trajectory">("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [millerOpen, setMillerOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [searchJump, setSearchJump] = useState("");
  const [chatFontSize, setChatFontSize] = useState(17);
  const [cwd, setCwd] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const projectsRef = useRef<string[]>([]);
  projectsRef.current = projects;
  const [manualProjects, setManualProjects] = useState(false);
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsage | null>(null);
  const [mode, setMode] = useState<Mode>("agent");
  const [model, setModel] = useState("grok-4.6");
  const modelLiveRef = useRef(model);
  modelLiveRef.current = model;
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("grok");
  const selectedAgentIdLiveRef = useRef<AgentId>("grok");
  selectedAgentIdLiveRef.current = selectedAgentId;
  const agentPickedRef = useRef(false);
  const modelPickedRef = useRef(false);
  const [showThinking, setShowThinking] = useState(true);
  const [chatWidth, setChatWidth] = useState(680);
  const [info, setInfo] = useState<DoctorInfo | null>(null);
  const [doctors, setDoctors] = useState<AgentDoctor[]>([]);
  const [cli, setCli] = useState<CliSettings | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [paneTree, setPaneTree] = useState<PaneNode>(() => singlePane());
  const [focusedPaneId, setFocusedPaneId] = useState(MAIN_PANE);
  const [extraPanes, setExtraPanes] = useState<Record<string, ExtraPaneState>>({});
  const [paneDrag, setPaneDrag] = useState<{
    sessionId: string;
    title: string;
    subtitle?: string;
    x: number;
    y: number;
    preview: Rect | null;
    allowed: boolean;
    resolved: ResolvedDrop | null;
  } | null>(null);
  const [, setMainBusyAt] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [picking, setPicking] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [menu, setMenu] = useState<SessionMenuState | null>(null);
  const [inboxCwd, setInboxCwd] = useState("");
  const [inboxSessions, setInboxSessions] = useState<SessionSummary[]>([]);
  const [movePick, setMovePick] = useState<{ id: string; top: number; left: number } | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [archived, setArchived] = useState<string[]>([]);
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>({});
  const [enterSends, setEnterSends] = useState(true);
  const [autoArchiveDays, setAutoArchiveDays] = useState(0);
  const [lastWorkspace, setLastWorkspace] = useState("");
  const [sidebarList, setSidebarList] = useState(DEFAULT_SIDEBAR_LIST);
  const [pinnedProjects, setPinnedProjects] = useState<string[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroupState>(EMPTY_PROJECT_GROUPS);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [sessionTokens, setSessionTokens] = useState<Record<string, number>>({});
  const [settingsFocus, setSettingsFocus] = useState<"shortcuts" | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [allowedTools, setAllowedTools] = useState<Set<string>>(() => new Set());
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [extraMentionData, setExtraMentionData] = useState<Record<string, PaneMentionData>>({});
  const [dismissedRecap, setDismissedRecap] = useState<string | null>(null);
  const [memoryChanges, setMemoryChanges] = useState<MemoryChange[]>([]);
  const memoryBaseline = useRef<Record<string, number> | null>(null);
  const [searchHits, setSearchHits] = useState<SessionSearchHit[] | null>(null);
  const [mruOpen, setMruOpen] = useState(false);
  const [planFile, setPlanFile] = useState<PlanFile | null>(null);
  const [goalView, setGoalView] = useState<GoalView | null>(null);
  const goalSessionRef = useRef<string | null>(null);
  const [rules, setRules] = useState<RuleFile[]>([]);
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [queue, setQueue] = useState<QueueState>(emptyQueue);
  const [focused, setFocused] = useState(true);
  const [steerByDefault, setSteerByDefault] = useState(false);
  const [injectUserMemory, setInjectUserMemory] = useState(DEFAULT_MEMORY_SETTINGS.injectUserMemory);
  const [dreamingEnabled, setDreamingEnabled] = useState(DEFAULT_MEMORY_SETTINGS.dreamingEnabled);
  const [dreamAgentId, setDreamAgentId] = useState<AgentId>(DEFAULT_MEMORY_SETTINGS.dreamAgentId);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [unread, setUnread] = useState<UnreadMap>({});
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR.initial);
  const [previewWidth, setPreviewWidth] = useState(PREVIEW.initial);
  const [winWidth, setWinWidth] = useState(() => window.innerWidth);
  const chatEl = useRef<HTMLDivElement>(null);
  const extraChatEls = useRef<Record<string, HTMLDivElement | null>>({});
  const composerRef = useRef<ComposerHandle>(null);
  const extraComposerRefs = useRef<Record<string, ComposerHandle | null>>({});
  const focusedPermissionPaneRef = useRef<PermissionPane | null>(MAIN_PANE);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(true);
  const busyStartRef = useRef<number | null>(null);
  const extraBusyStartRef = useRef<Record<string, number>>({});
  const currentTitleRef = useRef(t(locale, "notify.session"));
  const focusedSessionIdRef = useRef<string | null>(null);
  const titlesRef = useRef(titles);
  titlesRef.current = titles;
  const titleForSessionRef = useRef<(sessionId: string | null) => string>(() => t(locale, "notify.session"));
  const lastActivityRef = useRef(Date.now());
  const queueRef = useRef<QueueState>(emptyQueue());
  const persistRef = useRef<(partial: WebuiState) => void>(() => {});
  const doctorsRef = useRef<AgentDoctor[]>([]);
  doctorsRef.current = doctors;
  const refreshSessionsRef = useRef<(inbox?: string) => Promise<void>>(async () => {});
  const acpListedRef = useRef<Partial<Record<AgentId, SessionSummary[]>>>({});
  const diskSessionsRef = useRef<SessionSummary[]>([]);
  const allSessionsRef = useRef<SessionSummary[]>([]);
  titleForSessionRef.current = (sessionId) => {
    const sid = sessionId ?? "";
    const row = allSessionsRef.current.find((x) => x.id === sid);
    const name = displayTitle(row ?? { id: sid, title: "" }, titlesRef.current);
    return name.trim() || t(locale, "notify.session");
  };
  const onAcpSessionListRef = useRef<(agentId: AgentId, rows: SessionSummary[]) => void>(() => {});
  const onSessionCreatedRef = useRef<(row: SessionSummary) => void>(() => {});
  const reviewCloseRef = useRef(() => {});
  const persistReviewOpened = useRef(() => {});
  const runSlashRef = useRef<(cmd: CommandDef, rest?: string, dest?: string) => Promise<void>>(async () => {});
  const permissionCancelRef = useRef<(target: string) => Promise<void>>(async () => {});
  const workColRef = useRef<HTMLDivElement>(null);
  const extraPanesRef = useRef(extraPanes);
  extraPanesRef.current = extraPanes;
  const focusedPaneIdRef = useRef(focusedPaneId);
  focusedPaneIdRef.current = focusedPaneId;
  const paneTreeRef = useRef(paneTree);
  paneTreeRef.current = paneTree;
  const paneDragRef = useRef(paneDrag);
  paneDragRef.current = paneDrag;

  return {
    theme, setTheme, settingsOpen, setSettingsOpen, hubOpen, setHubOpen, hubTab, setHubTab,
    locale, setLocale, themeFamily, setThemeFamily, accentId, setAccentId, density, setDensity, hideToTray, setHideToTray,
    defaultRail, setDefaultRail, shortcuts, setShortcuts, inspect, setInspect, modelRows, setModelRows,
    effort, setEffort, effortReady, setEffortReady, extraPage, setExtraPage, imagineImages, setImagineImages,
    imagineVideos, setImagineVideos, agentRows, setAgentRows, managed, setManaged, usageHistory, setUsageHistory,
    appConfirm, setAppConfirm, cancelArmRef, usageDays, setUsageDays, jumpTurnId, setJumpTurnId,
    doctorNote, setDoctorNote, sawExit, setSawExit, threadView, setThreadView, sidebarCollapsed, setSidebarCollapsed,
    millerOpen, setMillerOpen, jobsOpen, setJobsOpen, catalogOpen, setCatalogOpen, searchJump, setSearchJump,
    chatFontSize, setChatFontSize, cwd, setCwd, projects, setProjects, projectsRef, manualProjects, setManualProjects,
    openProjects, setOpenProjects, sessions, setSessions, draft, setDraft, weeklyUsage, setWeeklyUsage,
    mode, setMode, model, setModel, selectedAgentId, setSelectedAgentId, selectedAgentIdLiveRef, agentPickedRef, modelPickedRef, modelLiveRef,
    showThinking, setShowThinking, chatWidth, setChatWidth, info, setInfo, doctors, setDoctors, cli, setCli,
    atBottom, setAtBottom, paneTree, setPaneTree, focusedPaneId, setFocusedPaneId, extraPanes, setExtraPanes,
    paneDrag, setPaneDrag, setMainBusyAt, clock, setClock, picking, setPicking, titles, setTitles,
    editingTitleId, setEditingTitleId, titleDraft, setTitleDraft, menu, setMenu, inboxCwd, setInboxCwd,
    inboxSessions, setInboxSessions, movePick, setMovePick, pinned, setPinned, archived, setArchived,
    sessionDrafts, setSessionDrafts, enterSends, setEnterSends, autoArchiveDays, setAutoArchiveDays,
    lastWorkspace, setLastWorkspace, sidebarList, setSidebarList, pinnedProjects, setPinnedProjects,
    projectGroups, setProjectGroups, openGroups, setOpenGroups, sessionTokens, setSessionTokens,
    settingsFocus, setSettingsFocus, expandedIds, setExpandedIds, collapsedIds, setCollapsedIds,
    allowedTools, setAllowedTools, workspaceEntries, setWorkspaceEntries, extraMentionData, setExtraMentionData,
    dismissedRecap, setDismissedRecap, memoryChanges, setMemoryChanges, memoryBaseline, searchHits, setSearchHits,
    mruOpen, setMruOpen, planFile, setPlanFile, goalView, setGoalView, goalSessionRef, rules, setRules,
    rewindTarget, setRewindTarget, worktreeBusy, setWorktreeBusy, queue, setQueue, focused, setFocused,
    steerByDefault, setSteerByDefault, injectUserMemory, setInjectUserMemory, dreamingEnabled, setDreamingEnabled,
    dreamAgentId, setDreamAgentId, settingsHydrated, setSettingsHydrated, unread, setUnread,
    sidebarWidth, setSidebarWidth, previewWidth, setPreviewWidth, winWidth, setWinWidth,
    chatEl, extraChatEls, composerRef, extraComposerRefs, focusedPermissionPaneRef, titleInputRef,
    focusedRef, busyStartRef, extraBusyStartRef, currentTitleRef, focusedSessionIdRef, titlesRef, titleForSessionRef, lastActivityRef, queueRef, persistRef,
    doctorsRef, refreshSessionsRef, acpListedRef, diskSessionsRef, allSessionsRef, onAcpSessionListRef, onSessionCreatedRef,
    reviewCloseRef, persistReviewOpened, runSlashRef, permissionCancelRef, workColRef,
    extraPanesRef, focusedPaneIdRef, paneTreeRef, paneDragRef,
  };
}
