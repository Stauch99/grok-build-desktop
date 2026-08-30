import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteSession,
  doctor,
  ensureInbox,
  gitChanges,
  gitCreateWorktree,
  gitStatus,
  listProjectRoots,
  pathIsDir,
  listSessions,
  listMemoryChanges,
  listWorkspaceEntries,
  loadWebuiState,
  moveSessionToCwd,
  notify,
  onWindowFocus,
  openPath,
  openReviewPath,
  pickDirectory,
  readPlan,
  listProjectRules,
  readTextFile,
  type PlanFile,
  type RuleFile,
  restoreTextFile,
  setBadge,
  setTrayStatus,
  setWorkspace,
  readCliSettings,
  windowFocused,
  type CliSettings,
  type DoctorInfo,
  type SessionSearchHit,
  type SessionSummary,
  type WebuiState,
  type WorkspaceEntry,
  inspectBrief,
  listModelsText,
  readModelsCache,
  setHideOnClose,
  onNotifyOpen,
  onTrayOpenLast,
  listImagineArtifacts,
  listAgentsDir,
  readManagedConfig,
  readUsageHistory,
} from "../api";
import { emptyChat, formatElapsed, type ChatItem } from "../lib/chat";
import type { Mode } from "../lib/mode";
import { normalizeEffort } from "../lib/effort";
import { canMoveInboxSession, sameCwd } from "../lib/inbox";
import { filterCommands, type CommandDef, type HubTab } from "../lib/commands";
import { normalizeLocale, t, type Locale } from "../lib/i18n";
import { mergeModelCatalog, modelsFromCache, parseModelsList } from "../lib/models";
import { parseInspect, skillSlashCommands, type InspectReport } from "../lib/inspect";
import {
  MAIN_PANE,
  applyDrop,
  canSplit,
  closePane,
  dragStarted,
  dropZone,
  ensureMainLeaf,
  hitPane,
  layoutRects,
  leafIds,
  paneOfSession,
  previewRect,
  resolveDrop,
  setRatio,
  singlePane,
  type Bindings,
  type PaneNode,
  type Rect,
  type ResolvedDrop,
} from "../lib/pane-tree";
import { openIdsFromBindings } from "../lib/session-presence";
import { recapIdentity, shouldShowSessionRecap } from "../lib/session-recap";
import { exportTranscript } from "../lib/session-local";
import { firstHitIndex } from "../lib/search-highlight";
import { permissionTimeoutNotice } from "../lib/permission-copy";
import { bindingFor, matchBinding } from "../lib/shortcuts-table";
import { subagentStatusFromTool } from "../lib/subagent";
import { describePlan, planRevert, previewRevert } from "../lib/checkpoint";
import { worktreeName } from "../lib/git";
import { dequeue, emptyQueue, type QueueState } from "../lib/prompt-queue";
import { notifyText, shouldNotify, trayStatus } from "../lib/notify";
import { countNeedsYou } from "../lib/session-badge";
import { fitLayout, loadWidth, PREVIEW, SIDEBAR } from "../lib/layout";
import { paneComposerTakeover, heroLayout, situationAutoCollapse } from "../lib/shell-ia";
import { agentHealth } from "../lib/agent-health";
import { shouldPollBilling } from "../lib/auth-kind";
import { doctorAll, importAgentsMcpFirstOpen } from "../lib/workbench-api";
import { billingKindFromDoctors } from "../lib/agent-port";
import { brandSessionList } from "../lib/session-list";
import { unionSessionsById } from "../lib/session-acp-list";
import { agentSendBlockReason, type AgentDoctor } from "../lib/agent-doctor";
import { lastTurnFiles } from "../lib/turn-files";
import { headerJobs } from "../lib/jobs-header";
import { subagentCatalog } from "../lib/subagent-tree";
import { nextGoalView, type GoalView } from "../lib/goal-bar";
import { turnStatsFromItems } from "../lib/usage-split";
import { activityKey, stallNote } from "../lib/stall";
import { deriveReviewTabs, persistReviewOpen, reconcileReviewTab } from "../lib/review-rail";
import { bashTools } from "../lib/tool-render";
import { deriveRunStatus, mainPaneIsBusy } from "../lib/run-status";
import { derivePermissionView, type PermissionPane } from "../lib/permission-view";
import { selectPanePermissions } from "../lib/permission-queue";
import { type PaneMentionData } from "../lib/pane-mentions";
import {
  clearUnread,
  deriveStatus,
  loadUnread,
  markUnread,
  pruneUnread,
  type SessionStatus,
  type UnreadMap,
} from "../lib/session-status";
import { displayTitle, keepExistingDirs, mergeProjectPaths, setTitleOverride } from "../lib/projects";
import {
  DEFAULT_SIDEBAR_LIST,
  INBOX_PIN,
  buildSidebarSections,
  loadSidebarList,
  prunePinnedProjects,
  pruneSessionTokens,
} from "../lib/sidebar-list";
import { loadDrafts } from "../lib/session-drafts";
import { menuPosition, type SessionMenuState } from "../SessionMenu";
import type { ExtraPage } from "../components/ExtraOverlay";
import type { ComposerHandle } from "../components/Composer";
import { detectMemoryUpdates, snapshotMtimes, type MemoryChange } from "../lib/memory-dock";
import { isTextPreviewable } from "../lib/preview";
import { parseWeeklyUsage, type WeeklyUsage } from "../lib/weekly-usage";
import { BILLING_POLL_MS, scheduleIdle, shouldBlockIdleComposer } from "../lib/agent-warmup";
import { reviewOwnerKey, useReviewController } from "./useReviewController";
import { useSessionHotkeys } from "./useSessionHotkeys";
import { useAcpSession, type ExtraPaneState } from "./useAcpSession";
import { useDreamJob } from "./useDreamJob";
import { useGitWatcher } from "./useGitWatcher";
import { useGitActions } from "./useGitActions";
import { useToast } from "./useToast";
import { usePermissionQueue } from "./usePermissionQueue";
import { useCommandPalette } from "./useCommandPalette";
import { useSlashCommands } from "./useSlashCommands";
import { useWebuiPersist } from "./useWebuiPersist";
import { basename } from "../lib/text";
import type { AgentId } from "../lib/agent-id";
import { keepLiveAgentOnHydrate, planOpenSession, shouldWarmupOnChipSelect } from "../lib/session-agent";
import { DEFAULT_MEMORY_SETTINGS, parseMemorySettings } from "../lib/memory-settings";

export type AppConfirm = {
  title: string;
  body: string;
  confirmLabel: string;
} & (
  | { kind: "delete-session"; session: SessionSummary }
  | { kind: "move-inbox"; sessionId: string; dest: string }
);

const FALLBACK_MODELS = ["grok-4.6", "grok-4.5", "grok-build"];

export function useAppModel() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>("skills");
  const [locale, setLocale] = useState<Locale>("zh");
  const [themeFamily, setThemeFamily] = useState<"default" | "paper" | "ink">("default");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [hideToTray, setHideToTray] = useState(true);
  const [defaultRail, setDefaultRail] = useState<"tasks" | "changes" | "context">("tasks");
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [inspect, setInspect] = useState<InspectReport | null>(null);
  const [modelCatalog, setModelCatalog] = useState<string[]>(FALLBACK_MODELS);
  const [extraPage, setExtraPage] = useState<ExtraPage | null>(null);
  const [imagineImages, setImagineImages] = useState<string[]>([]);
  const [imagineVideos, setImagineVideos] = useState<string[]>([]);
  const [agentRows, setAgentRows] = useState<{ name: string; path: string; kind: "agent" | "persona" }[]>([]);
  const [managed, setManaged] = useState<{ path: string; text: string; exists: boolean } | null>(null);
  const [usageHistory, setUsageHistory] = useState<{ at: number; used: number; size: number }[]>([]);
  const [appConfirm, setAppConfirm] = useState<AppConfirm | null>(null);
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
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsage | null>(null);
  const [mode, setMode] = useState<Mode>("agent");
  const [model, setModel] = useState("grok-4.6");
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("grok");
  const selectedAgentIdLiveRef = useRef<AgentId>("grok");
  selectedAgentIdLiveRef.current = selectedAgentId;
  const agentPickedRef = useRef(false);
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
  const currentTitleRef = useRef("会话");
  const lastActivityRef = useRef(Date.now());
  const queueRef = useRef<QueueState>(emptyQueue());
  const persistRef = useRef<(partial: WebuiState) => void>(() => {});
  const doctorsRef = useRef<AgentDoctor[]>([]);
  doctorsRef.current = doctors;
  const refreshSessionsRef = useRef<(inbox?: string) => Promise<void>>(async () => {});
  const acpListedRef = useRef<Partial<Record<AgentId, SessionSummary[]>>>({});
  const diskSessionsRef = useRef<SessionSummary[]>([]);
  const onAcpSessionListRef = useRef<(agentId: AgentId, rows: SessionSummary[]) => void>(() => {});
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
  const notifyReviewOpened = useCallback(() => persistReviewOpened.current(), []);

  function setSelectedAgentIdPersist(id: AgentId) {
    agentPickedRef.current = true;
    selectedAgentIdLiveRef.current = id;
    setSelectedAgentId(id);
    persistRef.current({ lastAgent: id });
  }

  const { toast, showToast } = useToast();

  const dream = useDreamJob({
    enabled: dreamingEnabled,
    dreamAgentId,
    selectedAgentId,
    doctors,
    locale,
    settingsHydrated,
    showToast,
  });

  const acp = useAcpSession({
    cwd,
    inboxCwd,
    projects,
    lastWorkspace,
    mode,
    selectedAgentId,
    setSelectedAgentId: setSelectedAgentIdPersist,
    sessionDrafts,
    titles,
    extraPanes,
    persist: (partial) => persistRef.current(partial),
    showToast,
    setCwd,
    setInboxCwd,
    setDraft,
    setSettingsOpen,
    setLastWorkspace,
    setAtBottom,
    setOpenProjects,
    setCollapsedIds,
    setExpandedIds,
    setUnread,
    setExtraPanes,
    onOpenSplit: () => {
      setMenu(null);
    },
    onSessionsNeedRefresh: (inbox) => refreshSessionsRef.current(inbox),
    onAcpSessionList: (agentId, rows) => onAcpSessionListRef.current(agentId, rows),
    setSawExit,
    lastActivityRef,
    steerByDefault,
    setSessionDrafts,
    queueRef,
    setQueue,
    onLocalSlash: (cmd, rest, dest) => runSlashRef.current(cmd, rest, dest),
    onCancelPermission: (target) => permissionCancelRef.current(target),
    injectUserMemory,
    userMd: dream.userMd,
    doctors,
  });
  const {
    sessionId,
    sessionIdRef,
    chat,
    setChat,
    busy,
    setBusy,
    ready,
    connecting,
    loadingSession,
    runningSessionId,
    setRunningSessionId,
    runningSessionIdRef,
    readyRef,
    rpc,
    ensureAgent,
    adoptSession,
    startInboxSession,
    startNewChat,
    startNewInPane,
    startSession,
    resumeSession,
    openInPane,
    sendSlashToAgent,
    sendPrompt,
    submitPrompt,
    altSubmit,
    cancelTurn,
    onDraftChange,
    injectedSessions,
    dismissInjectedSession,
    mainAgentIdRef,
    bindMainAgent,
  } = acp;

  const ensureAgentRef = useRef(ensureAgent);
  ensureAgentRef.current = ensureAgent;
  useEffect(() => {
    if (sessionId || doctors.length === 0) return;
    if (agentSendBlockReason(selectedAgentId, doctors)) return;
    if (!shouldWarmupOnChipSelect()) return;
    void ensureAgentRef.current(selectedAgentId).catch((e) => showToast(String(e)));
  }, [selectedAgentId, doctors, sessionId, showToast]);

  const paneCount = leafIds(paneTree).length;
  const focusedExtra = focusedPaneId !== MAIN_PANE ? extraPanes[focusedPaneId] : undefined;
  const reviewCwd = focusedExtra?.cwd || cwd;
  const reviewSessionId = focusedExtra?.sessionId ?? sessionId;
  const extraBusy = Object.values(extraPanes).some((p) => p.busy);
  const mainPaneBusy = mainPaneIsBusy({ busy, sessionId, runningSessionId });
  const review = useReviewController({
    cwd: reviewCwd,
    ownerKey: reviewOwnerKey(reviewSessionId, reviewCwd),
    disabled: false,
    readTextFile: async (path, allowRoot) => {
      if (reviewCwd) await setWorkspace(reviewCwd, reviewSessionId);
      return readTextFile(path, allowRoot);
    },
    openReviewPath: async (path, allowRoot) => {
      if (reviewCwd) await setWorkspace(reviewCwd, reviewSessionId);
      return openReviewPath(path, allowRoot);
    },
    onError: showToast,
    isTextPreviewable,
    onOpened: notifyReviewOpened,
  });
  const reviewOpen = review.open;
  const reviewTab = review.tab;
  const detailsTool = review.detailsTool;
  const { path: previewPath, text: previewText, truncated: previewTruncated, error: previewError } = review.preview;
  reviewCloseRef.current = () => review.close();

  const persist = useWebuiPersist({
    projects,
    theme,
    mode,
    chatWidth,
    titles,
    inboxCwd,
    chatFontSize,
    pinned,
    archived,
    drafts: sessionDrafts,
    enterSends,
    autoArchiveDays,
    filePanelOpen: reviewOpen,
    steerByDefault,
    injectUserMemory,
    dreamingEnabled,
    dreamAgentId,
    unread,
    sidebarWidth,
    previewWidth,
    locale,
    themeFamily,
    hideToTray,
    defaultRail,
    shortcuts,
    lastWorkspace,
    pinnedProjects,
    sessionTokens,
    sidebarList,
    lastAgent: selectedAgentId,
  });
  persistRef.current = persist;
  persistReviewOpened.current = () => persist(persistReviewOpen(true));

  const { git, changes, commits: gitCommits, branches: gitBranchList, worktrees: gitWorktrees, refresh: refreshGit } = useGitWatcher({
    cwd: reviewCwd,
    onWorkspaceTouched: (dir) => {
      void listWorkspaceEntries(dir).then(setWorkspaceEntries).catch(() => {});
    },
  });
  const { gitBusy, pullGit, pushGit, checkoutBranch, discardChange } = useGitActions({
    cwd: reviewCwd,
    git,
    showToast,
    refreshGit,
  });

  const extraPaneList = Object.entries(extraPanes).map(([id, pane]) => ({
    id,
    sessionId: pane.sessionId,
    busy: pane.busy,
  }));
  const { permissions, answerPermission, cancelPermission } = usePermissionQueue({
    allowedTools,
    sessionId,
    runningSessionId,
    splitId: extraPaneList[0]?.sessionId ?? null,
    busy,
    splitBusy: extraBusy,
    extraPanes: extraPaneList,
    focusedPaneRef: focusedPermissionPaneRef,
    focusedRef,
    currentTitleRef,
    onTimeoutNotice: () => showToast(permissionTimeoutNotice()),
  });

  const refreshInspect = useCallback(async (dir = cwd) => {
    try {
      const raw = await inspectBrief(dir || null);
      setInspect(parseInspect(raw));
    } catch {
      /* inspect is best-effort */
    }
  }, [cwd]);

  const refreshModels = useCallback(async () => {
    try {
      const [text, cache] = await Promise.all([listModelsText(), readModelsCache()]);
      setModelCatalog(mergeModelCatalog(parseModelsList(text), modelsFromCache(cache), FALLBACK_MODELS));
    } catch {
      setModelCatalog(FALLBACK_MODELS);
    }
  }, []);

  function openHub(tab: HubTab = "skills") {
    setHubTab(tab);
    setHubOpen(true);
    setSettingsOpen(false);
  }

  useEffect(() => {
    if (!reviewSessionId) {
      setPlanFile(null);
      return;
    }
    let cancelled = false;
    void readPlan(reviewSessionId)
      .then((file) => {
        if (!cancelled) setPlanFile(file);
      })
      .catch(() => {
        if (!cancelled) setPlanFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewSessionId, focusedExtra?.chat.plan, chat.plan, reviewTab, reviewOpen]);

  useEffect(() => {
    const reset = goalSessionRef.current !== sessionId;
    goalSessionRef.current = sessionId;
    setGoalView((prev) => nextGoalView(chat.plan, reset ? null : prev, Date.now()));
  }, [sessionId, chat.plan]);

  useEffect(() => {
    if (!reviewCwd) {
      setRules([]);
      return;
    }
    let cancelled = false;
    void listProjectRules(reviewCwd)
      .then((rows) => {
        if (!cancelled) setRules(rows);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewCwd, reviewTab, reviewOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeFamily = themeFamily;
    document.documentElement.dataset.density = density;
  }, [theme, themeFamily, density]);

  useEffect(() => {
    void setHideOnClose(hideToTray).catch(() => {});
  }, [hideToTray]);

  useEffect(() => {
    let off: (() => void) | undefined;
    void onTrayOpenLast(() => {
      const last = sessionIdRef.current
        ? [...inboxSessions, ...sessions].find((s) => s.id === sessionIdRef.current)
        : [...inboxSessions, ...sessions][0];
      if (last) void openSession(last);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [inboxSessions, sessions]);

  useEffect(() => {
    let off: (() => void) | undefined;
    void onNotifyOpen((sid) => {
      const s = [...inboxSessions, ...sessions].find((x) => x.id === sid);
      if (s) void openSession(s);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(".permission")?.focus();
      }, 200);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [inboxSessions, sessions]);

  const extraCwdKey = Object.values(extraPanes).map((p) => p.cwd).join("|");
  useEffect(() => {
    const cwds = Object.entries(extraPanes).map(([id, pane]) => [id, pane.cwd] as const);
    if (!cwds.length) {
      setExtraMentionData({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      cwds.map(async ([id, sc]) => {
        try {
          const [entries, cs] = await Promise.all([
            listWorkspaceEntries(sc),
            gitStatus(sc).then((status) => (status.isRepo ? gitChanges(sc) : [])).catch(() => []),
          ]);
          return [
            id,
            { cwd: sc, dirs: entries.filter((e) => e.kind === "dir").map((e) => e.name), changes: cs.map((c) => c.path) },
          ] as const;
        } catch {
          return [id, { cwd: sc, dirs: [], changes: [] }] as const;
        }
      }),
    ).then((rows) => {
      if (!cancelled) setExtraMentionData(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [extraCwdKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchBinding(bindingFor(shortcuts, "hub"), e)) {
        e.preventDefault();
        openHub("skills");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  useEffect(() => {
    if (!cwd) {
      setWorkspaceEntries([]);
      return;
    }
    void listWorkspaceEntries(cwd).then(setWorkspaceEntries).catch(() => setWorkspaceEntries([]));
  }, [cwd]);

  useEffect(() => {
    if (!cwd) return;
    void setWorkspace(cwd, sessionId).catch(() => {});
  }, [cwd, sessionId]);

  function openReview(action: Parameters<typeof review.openReview>[0]) {
    review.openReview(action);
    if (action === "changed-file") void refreshGit();
  }

  const openPreview = review.openPreview;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await listMemoryChanges();
        if (cancelled) return;
        if (!memoryBaseline.current) {
          memoryBaseline.current = snapshotMtimes(rows);
          setMemoryChanges([]);
          return;
        }
        setMemoryChanges(detectMemoryUpdates(rows, memoryBaseline.current, Date.now()));
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!atBottom) return;
    chatEl.current?.scrollTo({ top: chatEl.current.scrollHeight });
  }, [chat.items, mainPaneBusy, atBottom]);

  useEffect(() => {
    for (const [id, pane] of Object.entries(extraPanes)) {
      if (!pane.atBottom) continue;
      extraChatEls.current[id]?.scrollTo({ top: extraChatEls.current[id]!.scrollHeight });
    }
  }, [extraPanes]);

  useEffect(() => {
    if (busy) {
      // Keep the original start time if this re-ran for an unrelated dep.
      if (busyStartRef.current === null) busyStartRef.current = Date.now();
      setMainBusyAt((t) => t ?? Date.now());
      return;
    }
    const started = busyStartRef.current;
    const finishedId = runningSessionIdRef.current;
    busyStartRef.current = null;
    setMainBusyAt(null);
    runningSessionIdRef.current = null;
    setRunningSessionId(null);
    if (started === null) return;

    const elapsedMs = Date.now() - started;
    void refreshGit();
    // The badge is the durable signal; the notification is best-effort on top.
    if (!focusedRef.current && finishedId) {
      const id = finishedId;
      setUnread((prev) => {
        const next = markUnread(prev, id, "done");
        if (next !== prev) persist({ unread: next });
        return next;
      });
    }
    if (shouldNotify({ reason: "turn-done", focused: focusedRef.current, elapsedMs })) {
      const { title, body } = notifyText(
        "turn-done",
        currentTitleRef.current,
        formatElapsed(elapsedMs),
      );
      void notify(title, body);
    }
    // A queued prompt only goes out once the agent is actually free again.
    const { next, rest } = dequeue(queueRef.current);
    if (next) {
      setQueue(rest);
      queueRef.current = rest;
      void sendPrompt(next.text);
    }
  }, [busy, refreshGit]);

  useEffect(() => {
    const idle = Object.entries(extraPanes).filter(([, pane]) => !pane.busy);
    for (const [id, pane] of idle) {
      const started = extraBusyStartRef.current[id];
      delete extraBusyStartRef.current[id];
      if (started == null) continue;
      const { next, rest } = dequeue(pane.queue);
      if (!next) continue;
      setExtraPanes((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, queue: rest } };
      });
      void sendPrompt(next.text, id);
    }
    for (const [id, pane] of Object.entries(extraPanes)) {
      if (pane.busy && extraBusyStartRef.current[id] == null) extraBusyStartRef.current[id] = Date.now();
    }
  }, [extraPanes, sendPrompt]);

  useEffect(() => {
    if (!busy && !extraBusy) return;
    const id = window.setInterval(() => setClock((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy, extraBusy]);


  // Any new token, tool update or status flip counts as the turn being alive.
  const activity = useMemo(() => {
    const last = chat.items[chat.items.length - 1];
    const lastLen = last && "text" in last ? last.text.length : 0;
    const tools = chat.items
      .filter((i): i is Extract<ChatItem, { kind: "tool" }> => i.kind === "tool")
      .map((i) => i.status)
      .join(",");
    return activityKey(chat.items.length, lastLen, tools);
  }, [chat.items]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [activity]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Shrinking the window must never squeeze the conversation column away.
  useEffect(() => {
    const open = reviewOpen;
    const fit = fitLayout(sidebarWidth, previewWidth, winWidth, open);
    if (fit.sidebar !== sidebarWidth) setSidebarWidth(fit.sidebar);
    if (fit.preview !== previewWidth) setPreviewWidth(fit.preview);
  }, [winWidth, reviewOpen, sidebarWidth, previewWidth]);

  useEffect(() => {
    if (situationAutoCollapse(winWidth)) {
      review.close();
      persist(persistReviewOpen(false));
      setSidebarCollapsed(true);
    }
  }, [winWidth]);

  // Window focus drives every notification decision, so track it once here.
  useEffect(() => {
    let off: (() => void) | null = null;
    void windowFocused().then(setFocused);
    void onWindowFocus((next) => {
      setFocused(next);
      // Coming back clears only the session you are actually looking at.
      const id = sessionIdRef.current;
      if (!next || !id) return;
      setUnread((prev) => {
        const cleared = clearUnread(prev, id);
        if (cleared !== prev) persist({ unread: cleared });
        return cleared;
      });
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, []);

  const awaitingId = permissions[0] ? permissions[0].sessionId || runningSessionId || sessionId : null;

  useEffect(() => {
    void setTrayStatus(trayStatus(busy || extraBusy, permissions.length)).catch(() => {});
  }, [busy, extraBusy, permissions.length]);

  useEffect(() => {
    if (!editingTitleId) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitleId]);

  useEffect(() => {
    if (!menu && !movePick) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && (t.closest(".menu") || t.closest("[data-menu-trigger]"))) return;
      setMenu(null);
      setMovePick(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setMovePick(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, movePick]);

  function openMenu(kind: "header" | "row", id: string, el: HTMLElement, point?: { clientX: number; clientY: number }) {
    const pos = menuPosition(el, point);
    setMenu({ kind, id, ...pos });
  }

  function beginEditTitle(id?: string | null) {
    const sid = id || sessionIdRef.current;
    if (!sid) return;
    const s = sessions.find((x) => x.id === sid) ?? inboxSessions.find((x) => x.id === sid);
    setMenu(null);
    setTitleDraft(s ? displayTitle(s, titles) : "");
    setEditingTitleId(sid);
  }

  function cancelEditTitle() {
    setEditingTitleId(null);
    setTitleDraft("");
  }

  function commitTitle(raw: string) {
    const id = editingTitleId;
    if (!id) {
      cancelEditTitle();
      return;
    }
    const t = raw.trim();
    if (t === "--auto") {
      cancelEditTitle();
      showToast("不能把 --auto 当作标题");
      return;
    }
    if (!t) {
      cancelEditTitle();
      return;
    }
    const next = setTitleOverride(titles, id, t);
    setTitles(next);
    persist({ titles: next });
    setEditingTitleId(null);
  }

  async function moveInboxToProject(sessionId: string, dest: string) {
    if (!inboxCwd) return;
    const err = canMoveInboxSession(
      inboxSessions.find((s) => s.id === sessionId)?.cwd || inboxCwd,
      dest,
      inboxCwd,
    );
    if (err) {
      showToast(err);
      return;
    }
    setAppConfirm({
      title: "移入项目",
      body: "工作目录将改为该项目，agent 随后能读改仓库。独立对话不会搬回来。",
      confirmLabel: "移入",
      kind: "move-inbox",
      sessionId,
      dest,
    });
  }

  async function commitMoveInbox(sessionId: string, dest: string) {
    setMovePick(null);
    try {
      if (runningSessionIdRef.current === sessionId && busy) {
        await cancelTurn();
      }
      if (sessionIdRef.current === sessionId) {
        adoptSession(null);
        setChat(emptyChat());
      }
      const row = await moveSessionToCwd(sessionId, dest, inboxCwd);
      await refreshInbox();
      await selectProject(dest);
      await resumeSession(row);
      showToast("已移入项目");
    } catch (e) {
      showToast(String(e));
    }
  }

  function restoreGenerated(id: string) {
    const next = setTitleOverride(titles, id, "");
    setTitles(next);
    persist({ titles: next });
    setMenu(null);
  }

  useEffect(() => {
    void (async () => {
      try {
        void doctorAll().then(setDoctors).catch(() => setDoctors([]));
        void importAgentsMcpFirstOpen().catch(() => undefined);
        const [doc, state, roots, cliState] = await Promise.all([
          doctor(),
          loadWebuiState().catch(() => ({}) as WebuiState),
          listProjectRoots().catch(() => [] as string[]),
          readCliSettings().catch(() => null),
        ]);
        setSelectedAgentId(
          keepLiveAgentOnHydrate(agentPickedRef.current, state.lastAgent, selectedAgentIdLiveRef.current),
        );
        setInfo(doc);
        if (cliState) {
          setCli(cliState);
          if (cliState.model) setModel(cliState.model);
          setShowThinking(cliState.showThinking);
          if (cliState.yolo) setMode("yolo");
        }
        const merged = mergeProjectPaths(state.projects ?? [], roots);
        const live = new Set<string>();
        await Promise.all(
          merged.map(async (p) => {
            if (await pathIsDir(p).catch(() => false)) live.add(p);
          }),
        );
        const kept = keepExistingDirs(merged, (p) => live.has(p));
        setProjects(kept);
        if (kept.length < merged.length) persist({ projects: kept });
        if (state.theme === "dark" || state.theme === "light") setTheme(state.theme);
        if (typeof state.chatWidth === "number" && state.chatWidth >= 480 && state.chatWidth <= 1100) {
          setChatWidth(state.chatWidth);
        }
        if (state.mode) setMode(state.mode);
        if (typeof state.chatFontSize === "number" && state.chatFontSize >= 14 && state.chatFontSize <= 20) {
          setChatFontSize(state.chatFontSize);
        }
        if (state.titles && typeof state.titles === "object") {
          const next: Record<string, string> = {};
          for (const [id, title] of Object.entries(state.titles)) {
            if (typeof title === "string" && title.trim()) next[id] = title.trim().slice(0, 80);
          }
          setTitles(next);
        }
        if (Array.isArray(state.pinned)) setPinned(state.pinned.filter((id) => typeof id === "string"));
        if (Array.isArray(state.archived)) setArchived(state.archived.filter((id) => typeof id === "string"));
        setSessionDrafts(loadDrafts(state.drafts));
        if (typeof state.enterSends === "boolean") setEnterSends(state.enterSends);
        if (typeof state.autoArchiveDays === "number") setAutoArchiveDays(state.autoArchiveDays);
        if (typeof state.filePanelOpen === "boolean") {
          review.hydrateLegacy({ open: state.filePanelOpen });
        }
        if (typeof state.steerByDefault === "boolean") setSteerByDefault(state.steerByDefault);
        const memory = parseMemorySettings(state);
        setInjectUserMemory(memory.injectUserMemory);
        setDreamingEnabled(memory.dreamingEnabled);
        setDreamAgentId(memory.dreamAgentId);
        setLocale(normalizeLocale(state.locale));
        if (state.themeFamily === "paper" || state.themeFamily === "ink" || state.themeFamily === "default") {
          setThemeFamily(state.themeFamily);
        }
        const persistedDensity = (state as WebuiState & { density?: string }).density;
        if (persistedDensity === "compact" || persistedDensity === "comfortable") setDensity(persistedDensity);
        if (typeof state.hideToTray === "boolean") setHideToTray(state.hideToTray);
        if (state.defaultRail === "tasks" || state.defaultRail === "changes") {
          setDefaultRail(state.defaultRail);
          review.hydrateLegacy({ defaultTab: state.defaultRail });
        } else if (state.defaultRail === "context") {
          setDefaultRail("changes");
          review.hydrateLegacy({ defaultTab: "changes" });
        }
        if (state.shortcuts && typeof state.shortcuts === "object") setShortcuts(state.shortcuts);
        setUnread(loadUnread(state.unread));
        setSidebarWidth(loadWidth(state.sidebarWidth, SIDEBAR));
        setPreviewWidth(loadWidth(state.previewWidth, PREVIEW));
        setSidebarList(loadSidebarList(state.sidebarList));
        setLastWorkspace(typeof state.lastWorkspace === "string" ? state.lastWorkspace : "");
        const pinnedRaw = Array.isArray(state.pinnedProjects)
          ? state.pinnedProjects.filter((p): p is string => typeof p === "string")
          : [];
        setPinnedProjects(prunePinnedProjects(pinnedRaw, kept));
        const inbox = await ensureInbox(state.inboxCwd ?? null);
        setInboxCwd(inbox);
        const all = brandSessionList(await listSessions(null).catch(() => [] as SessionSummary[]));
        applySessionUnion(all, inbox);
        const tokenRaw = state.sessionTokens && typeof state.sessionTokens === "object" ? state.sessionTokens : {};
        setSessionTokens(pruneSessionTokens(tokenRaw, all.map((s) => s.id)));
        const initial = kept[0] || inbox;
        if (initial) setCwd(initial);
        void refreshInspect(initial || inbox);
        void refreshModels();
      } catch (e) {
        showToast(String(e));
      } finally {
        setSettingsHydrated(true);
      }
    })();
  }, []);

  const billingInflight = useRef(false);
  const refreshBillingRef = useRef<() => Promise<void>>(async () => {});
  refreshBillingRef.current = async () => {
    if (!readyRef.current || billingInflight.current) return;
    const kind = billingKindFromDoctors(doctorsRef.current ?? [], "grok");
    if (!shouldPollBilling(kind)) return;
    billingInflight.current = true;
    try {
      const raw = await rpc("_x.ai/billing", {}, { timeoutMs: 8000 });
      setWeeklyUsage(parseWeeklyUsage(raw));
    } catch {
      /* keep the last snapshot; billing is best-effort */
    } finally {
      billingInflight.current = false;
    }
  };

  useEffect(() => {
    if (!ready) return;
    void refreshBillingRef.current();
    const id = window.setInterval(() => void refreshBillingRef.current(), BILLING_POLL_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready || !focused) return;
    void refreshBillingRef.current();
  }, [ready, focused]);

  useEffect(() => {
    if (!ready) return;
    if (extraPage !== "usage" && !settingsOpen) return;
    void refreshBillingRef.current();
  }, [ready, extraPage, settingsOpen]);

  useEffect(() => {
    return scheduleIdle(() => {
      void readUsageHistory().then(setUsageHistory).catch(() => {});
      void readManagedConfig().then(setManaged).catch(() => {});
      void listAgentsDir().then(setAgentRows).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (extraPage === "usage" || settingsOpen) {
      void readUsageHistory().then(setUsageHistory).catch(() => {});
    }
    if (extraPage === "agents") {
      void listAgentsDir().then(setAgentRows).catch(() => {});
    }
    if (settingsOpen) {
      void readManagedConfig().then(setManaged).catch(() => {});
    }
  }, [extraPage, settingsOpen]);

  async function selectProject(path: string) {
    const last = path === INBOX_PIN || (inboxCwd && sameCwd(path, inboxCwd)) ? INBOX_PIN : path;
    setLastWorkspace(last);
    persist({ lastWorkspace: last });
    setCwd(path);
    setOpenProjects((m) => ({ ...m, [path]: true }));
    if (current && !sameCwd(current.cwd, path)) {
      adoptSession(null);
      setChat(emptyChat());
    }
    try {
      await setWorkspace(path);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function addProject() {
    if (picking) return;
    setPicking(true);
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      if (dir === "/" || dir === info?.grokHome || dir === (info?.grokHome ? undefined : "")) {
        showToast("请选择具体项目目录，不要选系统根目录");
        return;
      }
      const next = mergeProjectPaths([...projects, dir], []);
      setProjects(next);
      persist({ projects: next });
      await selectProject(dir);
    } catch (e) {
      showToast(String(e));
    } finally {
      setPicking(false);
    }
  }

  function applySessionUnion(disk: SessionSummary[], inbox: string) {
    diskSessionsRef.current = disk;
    const all = unionSessionsById(disk, Object.values(acpListedRef.current).flat());
    setInboxSessions(inbox ? all.filter((s) => sameCwd(s.cwd, inbox)) : []);
    setSessions(inbox ? all.filter((s) => !sameCwd(s.cwd, inbox)) : all);
  }

  function onAcpSessionList(agentId: AgentId, rows: SessionSummary[]) {
    acpListedRef.current = { ...acpListedRef.current, [agentId]: rows };
    applySessionUnion(diskSessionsRef.current, inboxCwd);
  }
  onAcpSessionListRef.current = onAcpSessionList;

  async function refreshAllSessions(inbox = inboxCwd) {
    try {
      applySessionUnion(brandSessionList(await listSessions(null)), inbox);
    } catch {
      setInboxSessions([]);
    }
  }
  refreshSessionsRef.current = refreshAllSessions;

  async function refreshInbox(path = inboxCwd) {
    await refreshAllSessions(path);
  }

  async function switchWorkdir(path: string) {
    const bound = current && inboxCwd ? !sameCwd(current.cwd, inboxCwd) : !!(current && current.cwd);
    const hasTurn = chat.items.some((i) => i.kind === "user" || i.kind === "assistant");
    if (bound && hasTurn) {
      showToast("项目内对话开始后不能再换目录");
      return;
    }
    setCwd(path);
    if (current && !sameCwd(current.cwd, path)) {
      adoptSession(null);
      setChat(emptyChat());
    }
    try {
      await setWorkspace(path);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function removeSession(s: SessionSummary) {
    setAppConfirm({
      title: "删除会话",
      body: `删除会话「${displayTitle(s, titles)}」？`,
      confirmLabel: "删除",
      kind: "delete-session",
      session: s,
    });
  }

  async function commitRemoveSession(s: SessionSummary) {
    try {
      await deleteSession(s.id);
      const next = setTitleOverride(titles, s.id, "");
      setTitles(next);
      persist({ titles: next });
      setMenu(null);
      if (editingTitleId === s.id) setEditingTitleId(null);
      if (sessionId === s.id) {
        adoptSession(null);
        setChat(emptyChat());
      }
      const extraId = Object.entries(extraPanesRef.current).find(([, pane]) => pane.sessionId === s.id)?.[0];
      if (extraId) closePaneLeaf(extraId);
      await refreshAllSessions();
    } catch (e) {
      showToast(String(e));
    }
  }

  function liveBindings(): Bindings {
    const b: Bindings = { [MAIN_PANE]: sessionIdRef.current };
    for (const [id, pane] of Object.entries(extraPanesRef.current)) b[id] = pane.sessionId;
    return b;
  }

  function findSessionById(id: string): SessionSummary | null {
    return sessions.find((s) => s.id === id) ?? inboxSessions.find((s) => s.id === id) ?? null;
  }

  function focusPane(paneId: string) {
    setFocusedPaneId(paneId);
    focusedPermissionPaneRef.current = paneId;
    window.setTimeout(() => {
      if (paneId === MAIN_PANE) composerRef.current?.focus();
      else extraComposerRefs.current[paneId]?.focus();
    }, 0);
  }

  function snapshotMain(): ExtraPaneState | null {
    if (!sessionIdRef.current) return null;
    return {
      sessionId: sessionIdRef.current,
      cwd,
      chat,
      draft,
      busy,
      atBottom,
      queue: queueRef.current,
      agentId: mainAgentIdRef.current,
    };
  }

  function applyMainFromExtra(extra: ExtraPaneState) {
    adoptSession(extra.sessionId);
    setChat(extra.chat);
    setCwd(extra.cwd);
    setDraft(extra.draft);
    setAtBottom(extra.atBottom);
    setQueue(extra.queue);
    queueRef.current = extra.queue;
    bindMainAgent(extra.agentId);
    setSelectedAgentIdPersist(extra.agentId);
  }

  async function commitDrop(drop: ResolvedDrop) {
    const tree = paneTreeRef.current;
    const bindings = liveBindings();
    const applied = applyDrop(tree, bindings, drop);
    if (!applied) return;
    const ensured = ensureMainLeaf(applied.tree, applied.bindings);
    const snap = snapshotMain();
    const nextExtras: Record<string, ExtraPaneState> = {};
    const needsLoad: { paneId: string; sessionId: string }[] = [];
    for (const [paneId, sid] of Object.entries(ensured.bindings)) {
      if (!sid || paneId === MAIN_PANE) continue;
      const existing = Object.values(extraPanesRef.current).find((p) => p.sessionId === sid);
      if (existing) nextExtras[paneId] = existing;
      else if (snap && snap.sessionId === sid) nextExtras[paneId] = snap;
      else needsLoad.push({ paneId, sessionId: sid });
    }
    const mainSid = ensured.bindings[MAIN_PANE] ?? null;
    if (mainSid && mainSid !== sessionIdRef.current) {
      const fromExtra = Object.values(extraPanesRef.current).find((p) => p.sessionId === mainSid);
      if (fromExtra) applyMainFromExtra(fromExtra);
      else {
        const s = findSessionById(mainSid);
        if (s) await resumeSession(s);
      }
    } else if (!mainSid && sessionIdRef.current) {
      adoptSession(null);
      setChat(emptyChat());
    }
    setPaneTree(ensured.tree);
    setExtraPanes(nextExtras);
    const nextFocus = ensured.retargetFrom === applied.focus
      ? MAIN_PANE
      : (leafIds(ensured.tree).includes(applied.focus) ? applied.focus : MAIN_PANE);
    focusPane(nextFocus);
    for (const item of needsLoad) {
      const s = findSessionById(item.sessionId);
      if (s) await openInPane(item.paneId, s);
    }
  }

  async function openSession(s: SessionSummary) {
    const existing = paneOfSession(liveBindings(), s.id);
    const planned = planOpenSession({
      session: s,
      alreadyBound: !!existing,
      currentChip: selectedAgentId,
    });
    setSelectedAgentIdPersist(planned.selectedAfterOpen);
    if (existing) {
      bindMainAgent(planned.selectedAfterOpen);
      focusPane(existing);
      return;
    }
    await openInPane(focusedPaneIdRef.current, s);
    focusPane(focusedPaneIdRef.current);
  }

  async function splitRight(s: SessionSummary) {
    const bindings = liveBindings();
    const existing = paneOfSession(bindings, s.id);
    if (existing) {
      focusPane(existing);
      return;
    }
    const target = focusedPaneIdRef.current;
    const work = workColRef.current?.getBoundingClientRect();
    const outer: Rect = work
      ? { left: work.left, top: work.top, right: work.right, bottom: work.bottom }
      : { left: 0, top: 0, right: 960, bottom: 720 };
    const hit = layoutRects(paneTreeRef.current, outer).find((leaf) => leaf.id === target);
    const rect = hit?.rect ?? outer;
    if (!canSplit(rect, "right")) {
      showToast(t(locale, "pane.tooSmall"));
      return;
    }
    const drop = resolveDrop({
      tree: paneTreeRef.current,
      bindings,
      sessionId: s.id,
      targetPane: target,
      zone: "right",
      targetRect: rect,
    });
    if (!drop.ok) {
      showToast(t(locale, "pane.tooSmall"));
      return;
    }
    await commitDrop(drop);
  }

  function closePaneLeaf(paneId: string) {
    const tree = paneTreeRef.current;
    if (leafIds(tree).length <= 1) return;
    const closed = closePane(tree, paneId);
    if (!closed) return;
    const extras = { ...extraPanesRef.current };
    if (paneId !== MAIN_PANE) delete extras[paneId];
    const ensured = ensureMainLeaf(closed.tree, {
      ...Object.fromEntries(leafIds(closed.tree).map((id) => [id, id === MAIN_PANE ? sessionIdRef.current : extras[id]?.sessionId ?? null])),
    });
    if (ensured.retargetFrom) {
      const extra = extras[ensured.retargetFrom];
      delete extras[ensured.retargetFrom];
      if (extra) applyMainFromExtra(extra);
    }
    const keep = new Set(leafIds(ensured.tree));
    for (const id of Object.keys(extras)) {
      if (!keep.has(id)) delete extras[id];
    }
    setPaneTree(ensured.tree);
    setExtraPanes(extras);
    const nextFocus = leafIds(ensured.tree).includes(focusedPaneIdRef.current) && focusedPaneIdRef.current !== paneId
      ? focusedPaneIdRef.current
      : MAIN_PANE;
    focusPane(nextFocus);
  }

  async function newChatInFocus() {
    if (focusedPaneIdRef.current !== MAIN_PANE && extraPanesRef.current[focusedPaneIdRef.current]) {
      await startNewInPane(focusedPaneIdRef.current);
      return;
    }
    await startNewChat();
  }

  function onPaneRatio(splitId: string, ratio: number) {
    setPaneTree((node) => setRatio(node, splitId, ratio));
  }

  function beginPaneDrag(e: { button: number; clientX: number; clientY: number }, s: SessionSummary) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    let last: ResolvedDrop | null = null;
    const title = displayTitle(s, titles);
    const subtitle = s.cwd ? basename(s.cwd) : undefined;
    const onMove = (ev: PointerEvent) => {
      if (!started && !dragStarted(ev.clientX - startX, ev.clientY - startY)) return;
      if (!started) {
        started = true;
        document.documentElement.classList.add("pane-dragging");
      }
      const work = workColRef.current?.getBoundingClientRect();
      if (!work) {
        last = null;
        setPaneDrag({ sessionId: s.id, title, subtitle, x: ev.clientX, y: ev.clientY, preview: null, allowed: false, resolved: null });
        return;
      }
      const outer = { left: work.left, top: work.top, right: work.right, bottom: work.bottom };
      const point = { x: ev.clientX, y: ev.clientY };
      const hit = hitPane(paneTreeRef.current, outer, point);
      if (!hit) {
        last = null;
        setPaneDrag({ sessionId: s.id, title, subtitle, x: ev.clientX, y: ev.clientY, preview: null, allowed: false, resolved: null });
        return;
      }
      const zone = dropZone(point, hit.rect);
      const resolved = resolveDrop({
        tree: paneTreeRef.current,
        bindings: liveBindings(),
        sessionId: s.id,
        targetPane: hit.id,
        zone,
        targetRect: hit.rect,
      });
      last = resolved.ok ? resolved : null;
      setPaneDrag({
        sessionId: s.id,
        title,
        subtitle,
        x: ev.clientX,
        y: ev.clientY,
        preview: previewRect(hit.rect, zone),
        allowed: resolved.ok,
        resolved,
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("pane-dragging");
      const resolved = started ? last : null;
      setPaneDrag(null);
      if (resolved) void commitDrop(resolved);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onExtraDraftChange(paneId: string, value: string) {
    setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      return { ...prev, [paneId]: { ...cur, draft: value } };
    });
  }

  function onExtraAtBottom(paneId: string, value: boolean) {
    setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur || cur.atBottom === value) return prev;
      return { ...prev, [paneId]: { ...cur, atBottom: value } };
    });
  }

  function onExtraQueue(paneId: string, update: (queue: QueueState) => QueueState) {
    setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      return { ...prev, [paneId]: { ...cur, queue: update(cur.queue) } };
    });
  }

  function copyAllConversation(items: ChatItem[]) {
    const text = exportTranscript(items);
    void navigator.clipboard.writeText(text).then(() => showToast("已复制全部对话"));
  }

  async function switchWorktree(path: string) {
    if (!path) return;
    await selectProject(path);
  }

  async function newWorktreeSession() {
    if (!cwd || !git?.isRepo || worktreeBusy) return;
    const base = current ? displayTitle(current, titles) : "";
    const name = worktreeName(base);
    setWorktreeBusy(true);
    try {
      const dir = await gitCreateWorktree(cwd, name);
      const next = mergeProjectPaths([...projects, dir], []);
      setProjects(next);
      persist({ projects: next });
      await selectProject(dir);
      await startSession(dir);
      showToast(`已在 ${basename(dir)} 开新会话`);
    } catch (e) {
      showToast(String(e));
    } finally {
      setWorktreeBusy(false);
    }
  }

  /**
   * Undo every file edit the agent made after a given turn. Destructive, so
   * the dialog states exactly what it will touch before this runs.
   */
  async function applyRewind(index: number) {
    const root = cwd || inboxCwd;
    if (!root) return;
    const plan = planRevert(chat.items, index);
    if (plan.steps.length === 0) {
      showToast(describePlan(plan));
      return;
    }

    let ok = 0;
    const failed: string[] = [];
    for (const step of plan.steps) {
      try {
        await restoreTextFile(step.path, step.kind === "restore" ? step.text : null, root);
        ok += 1;
      } catch {
        failed.push(step.path);
      }
    }
    await refreshGit();
    showToast(
      failed.length === 0
        ? `已还原 ${ok} 个文件`
        : `已还原 ${ok} 个，${failed.length} 个失败：${basename(failed[0])}`,
    );
  }

  const toggleExpand = useCallback((id: string, currentlyOpen: boolean) => {
    if (currentlyOpen) {
      setExpandedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setCollapsedIds((s) => new Set(s).add(id));
    } else {
      setCollapsedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setExpandedIds((s) => new Set(s).add(id));
    }
  }, []);

  const current = sessionId
    ? sessions.find((s) => s.id === sessionId) ?? inboxSessions.find((s) => s.id === sessionId) ?? null
    : null;
  const currentTitle = current ? displayTitle(current, titles) : sessionId ? "新会话" : "新对话";
  const sessionModel = current?.model ?? null;
  const isInbox = !!(inboxCwd && cwd && sameCwd(cwd, inboxCwd));
  const cwdLocked = !!(
    sessionId &&
    !isInbox &&
    chat.items.some((i) => i.kind === "user" || i.kind === "assistant")
  );
  const menuSession = menu
    ? menu.kind === "row"
      ? sessions.find((s) => s.id === menu.id) ?? inboxSessions.find((s) => s.id === menu.id) ?? null
      : current
    : null;
  const usage = chat.usage;

  useEffect(() => {
    if (!usage?.used || !usage.size) return;
    setUsageHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.used === usage.used && last.size === usage.size) return prev;
      return [...prev.slice(-48), { at: Date.now(), used: usage.used ?? 0, size: usage.size ?? 0 }];
    });
  }, [usage?.used, usage?.size]);

  useEffect(() => {
    if (!sessionId) return;
    const used = usage?.used;
    if (typeof used !== "number" || !Number.isFinite(used)) return;
    if (sessionTokens[sessionId] === used) return;
    const next = { ...sessionTokens, [sessionId]: used };
    setSessionTokens(next);
    persist({ sessionTokens: next });
  }, [sessionId, usage?.used, sessionTokens, persist]);
  const plan = chat.plan;
  const reviewChat = focusedExtra?.chat ?? chat;
  const reviewPlan = reviewChat.plan;
  const userTurns = chat.items.filter((i): i is Extract<ChatItem, { kind: "user" }> => i.kind === "user");
  const lastAssistant = [...chat.items].reverse().find((i) => i.kind === "assistant");
  const urlChips = lastAssistant && lastAssistant.kind === "assistant"
    ? Array.from(lastAssistant.text.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]).slice(0, 3)
    : [];

  function openSettings() {
    setSettingsOpen(true);
  }

  useEffect(() => {
    currentTitleRef.current = currentTitle;
  }, [currentTitle]);

  const allSessions = useMemo(
    () => [...inboxSessions, ...sessions],
    [inboxSessions, sessions],
  );

  const palette = useCommandPalette({
    sources: {
      sessions: allSessions,
      projects,
      commands: chat.commands,
      titles,
      cwd,
      isRepo: !!git?.isRepo,
    },
    onAction: (action) => {
      if (action.kind === "session") {
        const s = allSessions.find((x) => x.id === action.id);
        if (s) void openSession(s);
        return;
      }
      if (action.kind === "project") {
        void selectProject(action.path);
        return;
      }
      if (action.kind === "slash") {
        const cmd = filterCommands(action.name, chat.commands).find((c) => c.name === action.name);
        if (cmd) void runSlashRef.current(cmd);
        else composerRef.current?.setText(`${action.name} `);
        return;
      }
      switch (action.act) {
        case "new-chat":
          void newChatInFocus();
          break;
        case "new-session":
          void startSession();
          break;
        case "settings":
          openSettings();
          break;
        case "hub-skills":
          openHub("skills");
          break;
        case "hub-mcp":
          openHub("mcp");
          break;
        case "hub-plugins":
          openHub("skills");
          break;
        case "hub-hooks":
          openHub("hooks");
          break;
        case "hub-market":
          openHub("marketplace");
          break;
        case "fork":
          void sendPrompt("/fork");
          break;
        case "export": {
          const text = exportTranscript(chat.items);
          void navigator.clipboard.writeText(text).then(() => showToast("已复制导出会话"));
          break;
        }
        case "theme": {
          const next = theme === "light" ? "dark" : "light";
          setTheme(next);
          persist({ theme: next });
          break;
        }
        case "panel": {
          const next = !reviewOpen;
          review.toggle(defaultRail);
          persist(persistReviewOpen(next));
          break;
        }
        case "context":
          openReview("plan");
          break;
        case "dashboard":
          setExtraPage("dashboard");
          break;
        case "imagine":
          setExtraPage("imagine");
          void listImagineArtifacts(cwd || null).then((paths) => {
            setImagineImages(paths.filter((p) => !/\.(mp4|webm)$/i.test(p)));
            setImagineVideos(paths.filter((p) => /\.(mp4|webm)$/i.test(p)));
          }).catch(() => {});
          break;
        case "agents":
          setExtraPage("agents");
          void listAgentsDir().then(setAgentRows).catch(() => {});
          break;
        case "memory":
          setExtraPage("memory");
          break;
        case "usage":
          setExtraPage("usage");
          break;
        case "add-project":
          void addProject();
          break;
        case "worktree":
          void newWorktreeSession();
          break;
        case "finder":
          if (cwd) void openPath(cwd);
          break;
      }
    },
  });

  const busyIds = useMemo(() => {
    const ids: string[] = [];
    if (busy && runningSessionId) ids.push(runningSessionId);
    for (const pane of Object.values(extraPanes)) {
      if (pane.busy && pane.sessionId) ids.push(pane.sessionId);
    }
    return ids;
  }, [busy, runningSessionId, extraPanes]);

  const statusFor = useCallback(
    (id: string): SessionStatus => deriveStatus({ id, busyIds, awaitingId, unread }),
    [busyIds, awaitingId, unread],
  );

  useEffect(() => {
    void setBadge(countNeedsYou(allSessions.map((s) => statusFor(s.id))));
  }, [allSessions, statusFor]);

  function confirmAppModal() {
    const pending = appConfirm;
    setAppConfirm(null);
    if (!pending) return;
    if (pending.kind === "delete-session") void commitRemoveSession(pending.session);
    else void commitMoveInbox(pending.sessionId, pending.dest);
  }

  const sidebarSections = useMemo(
    () =>
      buildSidebarSections({
        sessions: allSessions,
        projects,
        inboxCwd,
        pinned,
        pinnedProjects,
        archived,
        autoArchiveDays,
        now: Date.now(),
        prefs: sidebarList,
        titles,
        statusFor,
        sessionTokens,
      }),
    [allSessions, projects, inboxCwd, pinned, pinnedProjects, archived, autoArchiveDays, clock, sidebarList, titles, statusFor, sessionTokens],
  );

  const visibleHotkeySessions = useMemo(
    () => sidebarSections.flatMap((section) => section.rows.map((r) => r.session.id)).slice(0, 9),
    [sidebarSections],
  );

  useSessionHotkeys({
    enabled: !settingsOpen && !menu && !palette.open,
    sessionIds: visibleHotkeySessions,
    onOpenIndex: (i) => {
      const id = visibleHotkeySessions[i];
      if (!id) return;
      const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
      if (s) void openSession(s);
    },
    onMru: () => setMruOpen((v) => !v),
  });

  // Sessions get deleted outside this app too; do not let the map grow forever.
  useEffect(() => {
    if (allSessions.length === 0) return;
    setUnread((prev) => {
      const next = pruneUnread(prev, allSessions.map((s) => s.id));
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      persist({ unread: next });
      return next;
    });
  }, [allSessions, persist]);

  /**
   * Only offer a rewind where the turn actually produced file edits. Indexed
   * once per thread change so the thread does not re-plan on every render.
   */
  useEffect(() => {
    if (!searchJump) return;
    const rows = chat.items
      .filter((i): i is Extract<ChatItem, { kind: "user" | "assistant" }> => i.kind === "user" || i.kind === "assistant")
      .map((i) => ({ id: i.id, text: i.text }));
    const hit = firstHitIndex(rows, searchJump);
    if (hit) setJumpTurnId(hit);
  }, [chat.items, searchJump]);

  const rewindIndex = useMemo(() => {
    const byId = new Map<string, number>();
    let lastEdit = -1;
    chat.items.forEach((item, i) => {
      byId.set(item.id, i);
      if (item.kind === "tool" && item.diff?.path) lastEdit = i;
    });
    return { byId, lastEdit };
  }, [chat.items]);

  const effort = normalizeEffort(cli?.effort);
  const { runSlash, applyMode, applyModel, applySessionModel, applyEffort } = useSlashCommands({
    cwd,
    inboxCwd,
    model,
    sessionModel,
    titles,
    chat,
    sessions,
    sessionId,
    extraPanes: Object.fromEntries(
      Object.entries(extraPanes).map(([id, pane]) => [id, { sessionId: pane.sessionId, busy: pane.busy, draft: pane.draft }]),
    ),
    mainPaneBusy,
    loadingSession,
    readyRef,
    sessionIdRef,
    currentTitleRef,
    composerRef,
    extraComposerRefs,
    rewindLastEdit: rewindIndex.lastEdit,
    cli,
    persist,
    showToast,
    setMode,
    setModel,
    setCli,
    setBusy,
    setExtraPanes,
    setDraft,
    setExtraPage,
    setImagineImages,
    setImagineVideos,
    setAgentRows,
    setTitles,
    setRewindTarget,
    sendSlashToAgent,
    sendPrompt,
    startSession,
    openSettings: () => setSettingsOpen(true),
    openHub,
    removeSession,
    restoreGenerated,
    beginEditTitle,
    onDreamNow: dream.onDreamNow,
  });
  runSlashRef.current = runSlash;

  const rewindForItem = useCallback(
    (itemId: string): (() => void) | undefined => {
      const index = rewindIndex.byId.get(itemId);
      if (index === undefined || index > rewindIndex.lastEdit) return undefined;
      return () => setRewindTarget(index);
    },
    [rewindIndex],
  );

  const rewindPreview = useMemo(() => {
    if (rewindTarget == null) return null;
    return {
      plan: planRevert(chat.items, rewindTarget),
      rows: previewRevert(chat.items, rewindTarget),
    };
  }, [rewindTarget, chat.items]);

  const subagentCards = useMemo(() => {
    const out: { id: string; name: string; status: ReturnType<typeof subagentStatusFromTool> }[] = [];
    for (const item of chat.items) {
      if (item.kind !== "tool") continue;
      const status = subagentStatusFromTool(item.title, item.status);
      if (!status) continue;
      out.push({ id: item.id, name: item.title, status });
    }
    return out;
  }, [chat.items]);

  const planComplete =
    mode === "plan" && plan.length > 0 && plan.every((e) => e.status === "completed");

  const dashboardSessions = useMemo(
    () =>
      allSessions.map((s) => {
        const st = statusFor(s.id);
        const status =
          st === "needs-you" ? "needs-input" : st === "working" ? "running" : "idle";
        return { id: s.id, title: displayTitle(s, titles), status } as const;
      }),
    [allSessions, statusFor, titles],
  );

  const memoryPath = rules.find((r) => r.name === "MEMORY.md")?.path;
  const agentsMdPath = rules.find((r) => r.name === "AGENTS.md")?.path;
  const permissionContext = {
    mainSessionId: sessionId,
    runningMainSessionId: runningSessionId,
    splitSessionId: extraPaneList[0]?.sessionId ?? null,
    mainBusy: busy,
    splitBusy: extraBusy,
    extraPanes: extraPaneList,
  };
  const panePermissions = selectPanePermissions(permissions, permissionContext);
  const mainPermission = panePermissions.main;
  permissionCancelRef.current = async (target) => {
    const selected = panePermissions[target];
    if (selected) await cancelPermission(selected);
  };
  const mainPermissionView = derivePermissionView({ ...permissionContext, request: mainPermission });
  const stallText = mainPaneBusy ? stallNote(Date.now() - lastActivityRef.current) : "";
  const takeover = paneComposerTakeover({ pane: "main", pendingPane: mainPermissionView.pane, pendingKind: mainPermissionView.kind, plan: !!planComplete });
  const layout = heroLayout({ hasMessages: chat.items.length > 0, hasCwd: !!cwd });
  const hero = {
    ...layout,
    blocked: layout.blocked || shouldBlockIdleComposer(connecting, ready, !!sessionId),
  };
  const turnFiles = lastTurnFiles(reviewChat.items);
  const terminalTools = bashTools(reviewChat.items);
  const reviewTabs = deriveReviewTabs({ planCount: reviewPlan.length, fileCount: turnFiles.length, changeCount: changes.length, contextCount: (planFile ? 1 : 0) + rules.length, hasDetails: !!detailsTool, hasPreview: !!previewPath, bashCount: terminalTools.length });
  const reconciledReviewTab = reconcileReviewTab(reviewTab, reviewTabs, defaultRail);
  useEffect(() => {
    if (reconciledReviewTab !== reviewTab) review.setTab(reconciledReviewTab);
  }, [reconciledReviewTab, reviewTab]);
  const jobs = headerJobs(chat.items);
  const catalog = subagentCatalog(chat.items);
  const goal = goalView?.text ?? null;
  const health = agentHealth({ ready, connecting, sawExit });
  const runStatus = deriveRunStatus({ disconnected: health === "disconnected", trustRequired: !!(inspect && cwd && inspect.projectTrusted === false), pending: mainPermissionView.statusPending, running: mainPaneBusy, stalled: !!stallText, stallDetail: stallText, planComplete });
  const turnStats = turnStatsFromItems(chat.items, usage?.output, {
    now: Date.now(),
    live: mainPaneBusy,
  });
  const skillCommands = skillSlashCommands(inspect?.skills ?? []);
  const recapText = (current?.lastTurnSummary ?? "").trim();
  const recapKey = recapIdentity(current?.lastTurnSummaryPromptId, recapText);
  const showRecap = shouldShowSessionRecap({ text: recapText, identity: recapKey, dismissed: dismissedRecap });
  function dismissRecap() {
    setDismissedRecap(recapKey);
  }
  const openIds = openIdsFromBindings(liveBindings());
  const focusedSessionId = focusedPaneId === MAIN_PANE ? sessionId : extraPanes[focusedPaneId]?.sessionId ?? sessionId;

  return {
    theme,
    setTheme,
    settingsOpen,
    setSettingsOpen,
    hubOpen,
    setHubOpen,
    hubTab,
    setHubTab,
    locale,
    setLocale,
    themeFamily,
    setThemeFamily,
    density,
    setDensity,
    hideToTray,
    setHideToTray,
    defaultRail,
    setDefaultRail,
    shortcuts,
    setShortcuts,
    inspect,
    skillCommands,
    modelCatalog,
    extraPage,
    setExtraPage,
    imagineImages,
    imagineVideos,
    agentRows,
    managed,
    usageHistory,
    appConfirm,
    confirmAppModal,
    cancelAppModal: () => setAppConfirm(null),
    usageDays,
    setUsageDays,
    jumpTurnId,
    doctorNote,
    setDoctorNote,
    threadView,
    setThreadView,
    sidebarCollapsed,
    setSidebarCollapsed,
    millerOpen,
    setMillerOpen,
    jobsOpen,
    setJobsOpen,
    catalogOpen,
    setCatalogOpen,
    searchJump,
    setSearchJump,
    chatFontSize,
    setChatFontSize,
    cwd,
    reviewCwd,
    reviewPlan,
    setCwd,
    projects,
    openProjects,
    setOpenProjects,
    sessions,
    draft,
    weeklyUsage,
    mode,
    setMode,
    model,
    setModel,
    showThinking,
    setShowThinking,
    chatWidth,
    setChatWidth,
    info,
    setInfo,
    cli,
    setCli,
    toast,
    atBottom,
    setAtBottom,
    paneTree,
    focusedPaneId,
    extraPanes,
    paneDrag,
    paneCount,
    openIds,
    focusedSessionId,
    workColRef,
    extraChatEls,
    extraComposerRefs,
    extraMentionData,
    extraBusyStartRef,
    clock,
    picking,
    titles,
    editingTitleId,
    titleDraft,
    setTitleDraft,
    menu,
    setMenu,
    inboxCwd,
    setInboxCwd,
    inboxSessions,
    movePick,
    setMovePick,
    pinned,
    setPinned,
    archived,
    setArchived,
    enterSends,
    setEnterSends,
    autoArchiveDays,
    setAutoArchiveDays,
    lastWorkspace,
    setLastWorkspace,
    sidebarList,
    setSidebarList,
    pinnedProjects,
    setPinnedProjects,
    sessionTokens,
    settingsFocus,
    setSettingsFocus,
    expandedIds,
    collapsedIds,
    setCollapsedIds,
    setAllowedTools,
    workspaceEntries,
    memoryChanges,
    setMemoryChanges,
    memoryBaseline,
    searchHits,
    setSearchHits,
    mruOpen,
    setMruOpen,
    rewindTarget,
    setRewindTarget,
    worktreeBusy,
    gitBusy,
    pullGit,
    pushGit,
    discardChange,
    queue,
    setQueue,
    steerByDefault,
    setSteerByDefault,
    injectUserMemory,
    setInjectUserMemory,
    dreamingEnabled,
    setDreamingEnabled,
    dreamAgentId,
    setDreamAgentId,
    doctors,
    unread,
    setUnread,
    sidebarWidth,
    setSidebarWidth,
    previewWidth,
    setPreviewWidth,
    winWidth,
    chatEl,
    composerRef,
    focusedPermissionPaneRef,
    titleInputRef,
    showToast,
    sessionId,
    selectedAgentId,
    setSelectedAgentId: (id: AgentId) => {
      setSelectedAgentIdPersist(id);
      void (async () => {
        let rows = doctorsRef.current;
        try {
          rows = await doctorAll();
          setDoctors(rows);
        } catch {
          /* keep last snapshot if the probe fails */
        }
        const blocked = agentSendBlockReason(id, rows);
        if (blocked) {
          showToast(blocked);
          return;
        }
        if (shouldWarmupOnChipSelect()) {
          await ensureAgent(id);
        }
      })().catch((e) => showToast(String(e)));
    },
    sessionIdRef,
    chat,
    busy,
    ready,
    connecting,
    loadingSession,
    ensureAgent,
    startInboxSession,
    newChatInFocus,
    startNewChat,
    startSession,
    resumeSession,
    openSession,
    splitRight,
    closePaneLeaf,
    beginPaneDrag,
    focusPane,
    onPaneRatio,
    onExtraDraftChange,
    onExtraAtBottom,
    onExtraQueue,
    mainPaneBusy,
    review,
    reviewOpen,
    previewPath,
    previewText,
    previewTruncated,
    previewError,
    persist,
    git,
    changes,
    gitCommits,
    gitBranchList,
    gitWorktrees,
    refreshGit,
    answerPermission,
    refreshInspect,
    openHub,
    openReview,
    openPreview,
    openMenu,
    beginEditTitle,
    cancelEditTitle,
    commitTitle,
    moveInboxToProject,
    restoreGenerated,
    selectProject,
    addProject,
    refreshInbox,
    switchWorkdir,
    removeSession,
    applyMode,
    applySessionModel,
    applyModel,
    applyEffort,
    effort,
    runSlash,
    submitPrompt,
    altSubmit,
    sendPrompt,
    cancelTurn,
    onDraftChange,
    newWorktreeSession,
    switchWorktree,
    checkoutBranch,
    applyRewind,
    toggleExpand,
    current,
    currentTitle,
    sessionModel,
    recapText,
    showRecap,
    dismissRecap,
    copyAllConversation,
    cwdLocked,
    menuSession,
    usage,
    plan,
    userTurns,
    urlChips,
    openSettings,
    allSessions,
    palette,
    statusFor,
    sidebarSections,
    visibleHotkeySessions,
    rewindForItem,
    rewindPreview,
    subagentCards,
    planComplete,
    dashboardSessions,
    memoryPath,
    agentsMdPath,
    mainPermission,
    mainPermissionView,
    panePermissions,
    takeover,
    hero,
    turnFiles,
    terminalTools,
    reviewTabs,
    reconciledReviewTab,
    jobs,
    catalog,
    goal,
    goalView,
    health,
    runStatus,
    turnStats,
    hasOpenSession: !!acp.sessionId,
    injectedSessions,
    dismissInjectedSession,
    dreamDiary: dream.diary,
    dreamStatus: dream.status,
    dreamCorpus: dream.corpus,
    dreamUserMdPath: dream.userMdPath,
    onDreamNow: dream.onDreamNow,
    profileUpdated: dream.profileUpdated,
    dismissProfileUpdated: dream.dismissProfileUpdated,
  };
}
