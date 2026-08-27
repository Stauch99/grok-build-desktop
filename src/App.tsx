import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteSession,
  doctor,
  ensureInbox,
  gitChanges,
  gitCreateWorktree,
  gitStatus,
  listProjectFiles,
  listProjectRoots,
  listSessions,
  listMemoryChanges,
  listWorkspaceEntries,
  loadWebuiState,
  moveSessionToCwd,
  nextRpcId,
  notify,
  onAcpMessage,
  onAcpRequest,
  onAcpStderr,
  onAgentExit,
  onWindowFocus,
  openInTerminal,
  openPath,
  searchSessionText,
  openReviewPath,
  patchCliSettings,
  pickDirectory,
  readPlan,
  listProjectRules,
  readSessionUpdates,
  readSessionUsage,
  readTextFile,
  type PlanFile,
  type RuleFile,
  restoreTextFile,
  saveWebuiState,
  sendRaw,
  setBadge,
  setTrayStatus,
  setWorkspace,
  startAgent,
  readCliSettings,
  windowFocused,
  type CliSettings,
  type DoctorInfo,
  type GitChange,
  type GitStatus,
  type JsonRpc,
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
  writeAllowedText,
  trustFolder,
  workspaceMtime,
  gitLog,
  gitBranches,
  listImagineArtifacts,
  listAgentsDir,
  readManagedConfig,
  readUsageHistory,
  runGrokStream,
  type GitCommit,
} from "./api";
import {
  applyChatUpdate,
  emptyChat,
  formatElapsed,
  hydrateFromUpdates,
  liveWorkStatus,
  shouldKeepSessionUpdate,
  type ChatItem,
  type ChatState,
} from "./lib/chat";
import type { Mode } from "./lib/mode";
import { normalizeEffort, type Effort } from "./lib/effort";
import { canMoveInboxSession, sameCwd } from "./lib/inbox";
import { filterCommands, parseRenameArgs, type CommandDef, type HubTab } from "./lib/commands";
import { normalizeLocale, type Locale } from "./lib/i18n";
import { t } from "./lib/i18n";
import { mergeModelCatalog, modelsFromCache, parseModelsList } from "./lib/models";
import { enabledMcpCount, parseInspect, type InspectReport } from "./lib/inspect";
import { formatSessionInfo, exportTranscript, lastAssistantText } from "./lib/session-local";
import { firstHitIndex } from "./lib/search-highlight";
import { permissionTimeoutNotice } from "./lib/permission-copy";
import { bindingFor, matchBinding } from "./lib/shortcuts-table";
import { isEditableShortcutTarget } from "./lib/shortcut-target";
import { subagentStatusFromTool } from "./lib/subagent";
import { modeLabel, slashForMode } from "./lib/mode";
import { describePlan, planRevert, previewRevert } from "./lib/checkpoint";
import { worktreeName } from "./lib/git";
import type { PaletteItem } from "./lib/palette";
import {
  dequeue,
  editQueued,
  emptyQueue,
  enqueue,
  removeQueued,
  reorderQueue,
  type QueueState,
} from "./lib/prompt-queue";
import { badgeCount, notifyText, shouldNotify, trayStatus } from "./lib/notify";
import { fitLayout, loadWidth, maxFor, PREVIEW, SIDEBAR } from "./lib/layout";
import {
  busyComposerHint,
  paneComposerTakeover,
  contextSummary,
  heroLayout,
  SIDEBAR_RAIL,
  situationAutoCollapse,
} from "./lib/shell-ia";
import { agentHealth, GROK_LOGIN_CMD } from "./lib/agent-health";
import { forkAtSlash, lastTurnFiles } from "./lib/turn-files";
import { headerJobs } from "./lib/jobs-header";
import { subagentCatalog } from "./lib/subagent-tree";
import { goalFromPlan } from "./lib/goal-bar";
import { turnStatsFromItems } from "./lib/usage-split";
import { DetailsPanel } from "./components/DetailsColumn";
import { GoalBar } from "./components/GoalBar";
import { StatsLineView } from "./components/StatsLineView";
import { MillerPicker } from "./components/MillerPicker";
import { Resizer } from "./components/Resizer";
import { activityKey, stallNote } from "./lib/stall";
import { deriveReviewTabs, persistReviewOpen, reconcileReviewTab } from "./lib/review-rail";
import { bashTools } from "./lib/tool-render";
import { deriveRunStatus } from "./lib/run-status";
import { derivePermissionView, type PermissionPane } from "./lib/permission-view";
import { enqueuePermission, markPermissionTimedOut, removePermission, selectPanePermissions, selectShortcutPermission, type QueuedPermission } from "./lib/permission-queue";
import { selectPaneMentionSource, type PaneMentionData } from "./lib/pane-mentions";
import {
  attentionCount,
  clearUnread,
  deriveStatus,
  loadUnread,
  markUnread,
  pruneUnread,
  type SessionStatus,
  type UnreadMap,
} from "./lib/session-status";
import { displayTitle, mergeProjectPaths, setTitleOverride } from "./lib/projects";
import { isArchived, isPinned, toggleId } from "./lib/session-chrome";
import {
  DEFAULT_SIDEBAR_LIST,
  INBOX_PIN,
  buildSidebarSections,
  loadSidebarList,
  projectForSession,
  prunePinnedProjects,
  pruneSessionTokens,
  resolveLastWorkspace,
} from "./lib/sidebar-list";
import { getDraft, loadDrafts, setDraft as writeDraft } from "./lib/session-drafts";
import { allowForSession, findAlwaysOption, parseToolName, pickAllowOption, shouldSkipPermission } from "./lib/permission-allow";
import { menuPosition, SessionMenu, type SessionMenuState } from "./SessionMenu";
import { SettingsPanel } from "./Settings";
import { ExtensionsHub } from "./components/ExtensionsHub";
import { Sidebar } from "./components/Sidebar";
import { PendingRequestCard } from "./components/PendingRequestCard";
import { FilePanel } from "./components/FilePanel";
import { PreviewPane } from "./components/PreviewPane";
import { ReviewHome } from "./components/ReviewHome";
import { ReviewRail } from "./components/ReviewRail";
import { RunStatusRegion } from "./components/RunStatusRegion";
import { MemoryDock } from "./components/MemoryDock";
import { handleMdClick, ThreadColumn, WaitPill } from "./components/Thread";
import { UsageRing } from "./components/UsageRing";
import { GitHistory } from "./components/GitHistory";
import { DiffSummary } from "./components/DiffSummary";
import { PlanCompleteCard } from "./components/PlanCompleteCard";
import { SubagentCard } from "./components/SubagentCard";
import { ExtraOverlay, type ExtraPage } from "./components/ExtraOverlay";
import { MenuSelect } from "./components/MenuSelect";
import { Composer, type ComposerHandle } from "./components/Composer";
import { CommandPalette } from "./components/CommandPalette";
import { ChangesPanel } from "./components/ChangesPanel";
import { GitBar } from "./components/GitBar";
import { EmptyState } from "./components/EmptyState";
import { RewindDialog } from "./components/RewindDialog";
import { detectMemoryUpdates, snapshotMtimes, type MemoryChange } from "./lib/memory-dock";
import { isTextPreviewable } from "./lib/preview";
import { useReviewController } from "./hooks/useReviewController";
import { useSessionHotkeys } from "./hooks/useSessionHotkeys";
import { asRecord, basename, surfaceStderr } from "./lib/text";
import {
  IconCheck,
  IconChevron,
  IconClose,
  IconPanel,
} from "./icons";

const FALLBACK_MODELS = ["grok-4.6", "grok-4.5", "grok-build"];


export function App() {
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
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [gitBranchList, setGitBranchList] = useState<string[]>([]);
  const [imagineImages, setImagineImages] = useState<string[]>([]);
  const [imagineVideos, setImagineVideos] = useState<string[]>([]);
  const [agentRows, setAgentRows] = useState<{ name: string; path: string; kind: "agent" | "persona" }[]>([]);
  const [managed, setManaged] = useState<{ path: string; text: string; exists: boolean } | null>(null);
  const [usageHistory, setUsageHistory] = useState<{ at: number; used: number; size: number }[]>([]);
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** Main-pane session that owns `busy`; stays put when the user switches threads. */
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [mode, setMode] = useState<Mode>("agent");
  const [model, setModel] = useState("grok-4.6");
  const [showThinking, setShowThinking] = useState(true);
  const [chatWidth, setChatWidth] = useState(680);
  const [info, setInfo] = useState<DoctorInfo | null>(null);
  const [cli, setCli] = useState<CliSettings | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<QueuedPermission[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [split, setSplit] = useState<{ id: string; cwd: string; chat: ChatState } | null>(null);
  const [splitDraft, setSplitDraft] = useState("");
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitAtBottom, setSplitAtBottom] = useState(true);
  const [, setMainBusyAt] = useState<number | null>(null);
  const [splitBusyAt, setSplitBusyAt] = useState<number | null>(null);
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
  const [splitMentionData, setSplitMentionData] = useState<PaneMentionData | null>(null);
  const [memoryChanges, setMemoryChanges] = useState<MemoryChange[]>([]);
  const memoryBaseline = useRef<Record<string, number> | null>(null);
  const [searchHits, setSearchHits] = useState<SessionSearchHit[] | null>(null);
  const [mruOpen, setMruOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [planFile, setPlanFile] = useState<PlanFile | null>(null);
  const [rules, setRules] = useState<RuleFile[]>([]);
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [queue, setQueue] = useState<QueueState>(emptyQueue);
  const [splitQueue, setSplitQueue] = useState<QueueState>(emptyQueue);
  const [focused, setFocused] = useState(true);
  const [steerByDefault, setSteerByDefault] = useState(false);
  const [unread, setUnread] = useState<UnreadMap>({});
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR.initial);
  const [previewWidth, setPreviewWidth] = useState(PREVIEW.initial);
  const [winWidth, setWinWidth] = useState(() => window.innerWidth);
  const chatEl = useRef<HTMLDivElement>(null);
  const splitChatEl = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const splitComposerRef = useRef<ComposerHandle>(null);
  const focusedPermissionPaneRef = useRef<PermissionPane | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(true);
  const busyStartRef = useRef<number | null>(null);
  const splitBusyStartRef = useRef<number | null>(null);
  const currentTitleRef = useRef("会话");
  const lastActivityRef = useRef(Date.now());
  const busyRef = useRef(false);
  const queueRef = useRef<QueueState>(emptyQueue());
  const splitQueueRef = useRef<QueueState>(emptyQueue());
  const sessionIdRef = useRef<string | null>(null);
  const runningSessionIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const ensurePromise = useRef<Promise<void> | null>(null);
  const pendingRpc = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const echoedUser = useRef(false);
  const echoedSplitUser = useRef(false);
  const loadGen = useRef(0);
  const ignoreReplay = useRef(false);
  const ignoreSplitReplay = useRef(false);
  const pendingPrompt = useRef<"main" | "split" | null>(null);
  const pendingDest = useRef(new Map<number, "main" | "split">());
  const persistTimer = useRef<number | null>(null);
  const persistReviewOpened = useRef(() => {});
  const notifyReviewOpened = useCallback(() => persistReviewOpened.current(), []);

  const mainPaneBusy = busy && !!sessionId && sessionId === runningSessionId;
  const review = useReviewController({
    cwd,
    ownerKey: (sessionId || "") + "|" + cwd,
    disabled: !!split,
    readTextFile,
    openReviewPath,
    onError: (message) => { setToast(message); window.setTimeout(() => setToast(null), 2800); },
    isTextPreviewable,
    onOpened: notifyReviewOpened,
  });
  const reviewOpen = review.open;
  const reviewTab = review.tab;
  const detailsTool = review.detailsTool;
  const { path: previewPath, text: previewText, truncated: previewTruncated, error: previewError } = review.preview;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  const persist = useCallback((partial: WebuiState) => {
    const next: WebuiState = {
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
      unread,
      sidebarWidth,
      previewWidth,
      locale,
      themeFamily,
      density,
      hideToTray,
      defaultRail,
      shortcuts,
      lastWorkspace,
      pinnedProjects,
      sessionTokens,
      sidebarList,
      ...partial,
    };
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveWebuiState(next);
    }, 200);
  }, [projects, theme, mode, chatWidth, titles, inboxCwd, chatFontSize, pinned, archived, sessionDrafts, enterSends, autoArchiveDays, reviewOpen, steerByDefault, unread, sidebarWidth, previewWidth, locale, themeFamily, density, hideToTray, defaultRail, shortcuts, lastWorkspace, pinnedProjects, sessionTokens, sidebarList]);
  persistReviewOpened.current = () => persist(persistReviewOpen(true));

  const refreshGit = useCallback(
    async (dir = cwd) => {
      if (!dir) {
        setGit(null);
        setChanges([]);
        return;
      }
      try {
        const status = await gitStatus(dir);
        setGit(status);
        setChanges(status.isRepo ? await gitChanges(dir) : []);
      } catch {
        setGit(null);
        setChanges([]);
      }
    },
    [cwd],
  );

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
    if (!sessionId) {
      setPlanFile(null);
      return;
    }
    let cancelled = false;
    void readPlan(sessionId)
      .then((file) => {
        if (!cancelled) setPlanFile(file);
      })
      .catch(() => {
        if (!cancelled) setPlanFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, chat.plan, reviewTab, reviewOpen]);

  useEffect(() => {
    if (!cwd) {
      setRules([]);
      return;
    }
    let cancelled = false;
    void listProjectRules(cwd)
      .then((rows) => {
        if (!cancelled) setRules(rows);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, reviewTab, reviewOpen]);

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
      if (last) void resumeSession(last);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [inboxSessions, sessions]);

  useEffect(() => {
    let off: (() => void) | undefined;
    void onNotifyOpen((sid) => {
      const s = [...inboxSessions, ...sessions].find((x) => x.id === sid);
      if (s) void resumeSession(s);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(".permission")?.focus();
      }, 200);
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, [inboxSessions, sessions]);

  useEffect(() => {
    const timers = permissions.filter((r) => !r.timedOut).map((r) => window.setTimeout(() => { setPermissions((q) => markPermissionTimedOut(q, r)); void answerPermission(r, ""); showToast(permissionTimeoutNotice()); }, Math.max(0, 90_000 - (Date.now() - r.receivedAt))));
    return () => timers.forEach(window.clearTimeout);
  }, [permissions]);

  useEffect(() => {
    if (!cwd) return;
    let last = 0;
    const tick = () => {
      void workspaceMtime(cwd).then((n) => {
        if (last && n && n !== last) {
          void refreshGit();
          void listWorkspaceEntries(cwd).then(setWorkspaceEntries).catch(() => {});
        }
        last = n;
      }).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [cwd, refreshGit]);

  useEffect(() => {
    const sc = split?.cwd; if (!sc) { setSplitMentionData(null); return; }
    let cancelled = false; setSplitMentionData(null);
    void Promise.all([listWorkspaceEntries(sc), gitStatus(sc).then((status) => status.isRepo ? gitChanges(sc) : []).catch(() => [])]).then(([entries, cs]) => { if (!cancelled) setSplitMentionData({ cwd: sc, dirs: entries.filter((e) => e.kind === "dir").map((e) => e.name), changes: cs.map((c) => c.path) }); }).catch(() => { if (!cancelled) setSplitMentionData({ cwd: sc, dirs: [], changes: [] }); });
    return () => { cancelled = true; };
  }, [split?.cwd]);

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
    if (!cwd || !git?.isRepo) {
      setGitCommits([]);
      setGitBranchList([]);
      return;
    }
    void gitLog(cwd).then(setGitCommits).catch(() => setGitCommits([]));
    void gitBranches(cwd).then(setGitBranchList).catch(() => setGitBranchList([]));
  }, [cwd, git?.isRepo, reviewTab]);

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
    if (!split || !splitAtBottom) return;
    splitChatEl.current?.scrollTo({ top: splitChatEl.current.scrollHeight });
  }, [split?.chat.items, splitBusy, splitAtBottom, split]);

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
    if (splitBusy) {
      if (splitBusyStartRef.current === null) splitBusyStartRef.current = Date.now();
      setSplitBusyAt((t) => t ?? Date.now());
      return;
    }
    const started = splitBusyStartRef.current;
    splitBusyStartRef.current = null;
    setSplitBusyAt(null);
    if (started === null) return;
    const { next, rest } = dequeue(splitQueueRef.current);
    if (next) {
      setSplitQueue(rest);
      splitQueueRef.current = rest;
      void sendPrompt(next.text, "split");
    }
  }, [splitBusy]);

  useEffect(() => {
    if (!busy && !splitBusy) return;
    const id = window.setInterval(() => setClock((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy, splitBusy]);


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
    splitQueueRef.current = splitQueue;
  }, [splitQueue]);

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Shrinking the window must never squeeze the conversation column away.
  useEffect(() => {
    const open = reviewOpen && !split;
    const fit = fitLayout(sidebarWidth, previewWidth, winWidth, open);
    if (fit.sidebar !== sidebarWidth) setSidebarWidth(fit.sidebar);
    if (fit.preview !== previewWidth) setPreviewWidth(fit.preview);
  }, [winWidth, reviewOpen, split, sidebarWidth, previewWidth]);

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

  const doneUnread = useMemo(
    () => Object.values(unread).filter((k) => k === "done").length,
    [unread],
  );
  const awaitingId = permissions[0] ? permissions[0].sessionId || runningSessionId || sessionId : null;

  useEffect(() => {
    void setBadge(badgeCount(attentionCount(unread, awaitingId), doneUnread));
  }, [unread, awaitingId, doneUnread]);

  useEffect(() => {
    void setTrayStatus(trayStatus(busy || splitBusy, permissions.length)).catch(() => {});
  }, [busy, splitBusy, permissions.length]);

  // Command palette. Cmd+K must win even while the composer has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setPaletteOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void refreshGit(cwd);
  }, [cwd, refreshGit]);

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

  function adoptSession(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
  }

  function beginMainRun(sid: string) {
    runningSessionIdRef.current = sid;
    setRunningSessionId(sid);
    setBusy(true);
  }

  function openMenu(kind: "header" | "row", id: string, el: HTMLElement) {
    const pos = menuPosition(el);
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
    if (!window.confirm("工作目录将改为该项目，agent 随后能读改仓库。独立对话不会搬回来。")) return;
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

  async function refreshUsage(id: string, dest: "main" | "split" = "main") {
    try {
      const usage = await readSessionUsage(id);
      if (!usage) return;
      if (dest === "split") {
        setSplit((prev) => (prev && prev.id === id ? { ...prev, chat: { ...prev.chat, usage } } : prev));
        return;
      }
      if (sessionIdRef.current === id) {
        setChat((prev) => ({ ...prev, usage }));
      }
    } catch {
      /* signals.json is best-effort */
    }
  }

  function handleRpcMessage(msg: JsonRpc) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const id = Number(msg.id);
      const waiter = pendingRpc.current.get(id);
      if (waiter) {
        pendingRpc.current.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      if (msg.result && typeof msg.result === "object" && msg.result !== null && "stopReason" in msg.result) {
        const dest = pendingDest.current.get(id) ?? pendingPrompt.current;
        pendingDest.current.delete(id);
        if (dest === "split") setSplitBusy(false);
        else setBusy(false);
        pendingPrompt.current = null;
      }
    }
    if (msg.method === "session/update" || msg.method === "_x.ai/session/update") {
      const params = asRecord(msg.params);
      const sid = typeof params.sessionId === "string" ? params.sessionId : null;
      const splitId = split?.id ?? null;
      const forSplit = !!(splitId && sid && sid === splitId);
      if (!forSplit && !shouldKeepSessionUpdate(sessionIdRef.current, sid)) return;
      if (ignoreReplay.current && !forSplit) return;
      if (forSplit && ignoreSplitReplay.current) return;
      const update = asRecord(params.update);
      const kind = String(update.sessionUpdate ?? "");
      if (kind === "turn_completed" || kind === "auto_compact_started" || kind === "auto_compact_completed") {
        const id = sid || (forSplit ? splitId : sessionIdRef.current);
        if (id) void refreshUsage(id, forSplit ? "split" : "main");
      }
      if (forSplit) {
        setSplit((prev) => prev ? { ...prev, chat: applyChatUpdate(prev.chat, params, { skipUser: echoedSplitUser.current }) } : prev);
        return;
      }
      setChat((prev) => applyChatUpdate(prev, params, { skipUser: echoedUser.current }));
    }
  }
  const handleRef = useRef(handleRpcMessage);
  handleRef.current = handleRpcMessage;

  useEffect(() => {
    let cancelled = false;
    const offs: Array<() => void> = [];
    void (async () => {
      const a = await onAcpMessage((m) => handleRef.current(m));
      const b = await onAcpRequest((msg) => {
        if (msg.method !== "session/request_permission" || msg.id === undefined) return;
        const params = asRecord(msg.params);
        const tool = asRecord(params.toolCall);
        const options = (Array.isArray(params.options) ? params.options : [])
          .map((o) => asRecord(o))
          .filter((o) => typeof o.optionId === "string" && typeof o.name === "string")
          .map((o) => ({ optionId: String(o.optionId), name: String(o.name), kind: String(o.kind ?? "") }));
        setPermissions((queue) => enqueuePermission(queue, {
          rpcId: msg.id!,
          title: String(tool.title || "需要许可"),
          toolKind: String(tool.kind ?? tool.toolKind ?? ""),
          options,
          sessionId: typeof params.sessionId === "string" ? params.sessionId : null,
          receivedAt: Date.now(), timedOut: false,
        }));
      });
      const c = await onAcpStderr((line) => {
        const msg = surfaceStderr(line);
        if (msg) showToast(msg);
      });
      const d = await onAgentExit(() => {
        // Dying mid-turn is the one case that must not read as "finished".
        if (busyRef.current && runningSessionIdRef.current) {
          const id = runningSessionIdRef.current;
          setUnread((prev) => markUnread(prev, id, "error"));
        }
        readyRef.current = false;
        setReady(false);
        setSawExit(true);
        setBusy(false);
        setSplitBusy(false);
        setConnecting(false);
        pendingPrompt.current = null;
        ensurePromise.current = null;
      });
      if (cancelled) {
        a(); b(); c(); d();
        return;
      }
      offs.push(a, b, c, d);
    })();
    return () => {
      cancelled = true;
      offs.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [doc, state, roots, cliState] = await Promise.all([
          doctor(),
          loadWebuiState().catch(() => ({}) as WebuiState),
          listProjectRoots().catch(() => [] as string[]),
          readCliSettings().catch(() => null),
        ]);
        setInfo(doc);
        if (cliState) {
          setCli(cliState);
          if (cliState.model) setModel(cliState.model);
          setShowThinking(cliState.showThinking);
          if (cliState.yolo) setMode("yolo");
        }
        const merged = mergeProjectPaths(state.projects ?? [], roots);
        setProjects(merged);
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
        setLocale(normalizeLocale(state.locale));
        if (state.themeFamily === "paper" || state.themeFamily === "ink" || state.themeFamily === "default") {
          setThemeFamily(state.themeFamily);
        }
        if (state.density === "compact" || state.density === "comfortable") setDensity(state.density);
        if (typeof state.hideToTray === "boolean") setHideToTray(state.hideToTray);
        if (state.defaultRail === "tasks" || state.defaultRail === "changes" || state.defaultRail === "context") {
          setDefaultRail(state.defaultRail);
          review.hydrateLegacy({ defaultTab: state.defaultRail });
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
        setPinnedProjects(prunePinnedProjects(pinnedRaw, merged));
        const inbox = await ensureInbox(state.inboxCwd ?? null);
        setInboxCwd(inbox);
        const all = await listSessions(null).catch(() => [] as SessionSummary[]);
        setInboxSessions(all.filter((s) => sameCwd(s.cwd, inbox)));
        setSessions(all.filter((s) => !sameCwd(s.cwd, inbox)));
        const tokenRaw = state.sessionTokens && typeof state.sessionTokens === "object" ? state.sessionTokens : {};
        setSessionTokens(pruneSessionTokens(tokenRaw, all.map((s) => s.id)));
        const initial = merged[0] || inbox;
        if (initial) setCwd(initial);
        void refreshInspect(initial || inbox);
        void refreshModels();
        void readManagedConfig().then(setManaged).catch(() => {});
        void readUsageHistory().then(setUsageHistory).catch(() => {});
        void listAgentsDir().then(setAgentRows).catch(() => {});
        if (doc.grokPath) {
          void ensureAgent().catch((e) => showToast(String(e)));
        }
      } catch (e) {
        showToast(String(e));
      }
    })();
  }, []);

  async function rpc(
    method: string,
    params: unknown,
    opts?: { timeoutMs?: number; dest?: "main" | "split" },
  ): Promise<unknown> {
    const id = await nextRpcId();
    if (opts?.dest) pendingDest.current.set(id, opts.dest);
    const timeoutMs = opts?.timeoutMs ?? (method === "session/prompt" ? 0 : 180000);
    return new Promise((resolve, reject) => {
      pendingRpc.current.set(id, { resolve, reject });
      void sendRaw({ jsonrpc: "2.0", id, method, params }).catch((e) => {
        pendingRpc.current.delete(id);
        pendingDest.current.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
      if (timeoutMs > 0) {
        window.setTimeout(() => {
          if (pendingRpc.current.has(id)) {
            pendingRpc.current.delete(id);
            pendingDest.current.delete(id);
            reject(new Error(`${method} 超时`));
          }
        }, timeoutMs);
      }
    });
  }

  async function ensureAgent(): Promise<void> {
    if (readyRef.current) return;
    if (ensurePromise.current) return ensurePromise.current;
    setConnecting(true);
    ensurePromise.current = (async () => {
      await startAgent();
      await rpc("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "grok-build-webui", title: "Grok Build", version: "0.4.0" },
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      });
      readyRef.current = true;
      setReady(true);
      setSawExit(false);
    })()
      .catch((e) => {
        ensurePromise.current = null;
        throw e;
      })
      .finally(() => setConnecting(false));
    return ensurePromise.current;
  }

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

  async function refreshAllSessions(inbox = inboxCwd) {
    try {
      const all = await listSessions(null);
      setInboxSessions(inbox ? all.filter((s) => sameCwd(s.cwd, inbox)) : []);
      setSessions(inbox ? all.filter((s) => !sameCwd(s.cwd, inbox)) : all);
    } catch {
      setInboxSessions([]);
    }
  }

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

  async function createAcpSession(work: string): Promise<string> {
    const meta: Record<string, unknown> = {};
    if (mode === "yolo") meta.yoloMode = true;
    const result = asRecord(await rpc("session/new", { cwd: work || ".", mcpServers: [], _meta: meta }));
    const sid = String(result.sessionId ?? "");
    if (!sid) throw new Error("session/new 没有返回 sessionId");
    adoptSession(sid);
    await setWorkspace(work || ".", sid);
    window.setTimeout(() => void refreshAllSessions(), 500);
    return sid;
  }

  async function startInboxSession() {
    try {
      const inbox = await ensureInbox(inboxCwd || null);
      setInboxCwd(inbox);
      persist({ inboxCwd: inbox });
      setCwd(inbox);
      setChat(emptyChat());
      setDraft("");
      echoedUser.current = false;
      await ensureAgent();
      await setWorkspace(inbox);
      await createAcpSession(inbox);
      setSettingsOpen(false);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function startNewChat() {
    const work = resolveLastWorkspace(lastWorkspace, projects, inboxCwd);
    if (!work || (inboxCwd && sameCwd(work, inboxCwd))) {
      await startInboxSession();
      return;
    }
    await startSession(work);
  }

  async function startSession(workDir?: string) {
    const work = workDir || cwd;
    if (!work || (inboxCwd && sameCwd(work, inboxCwd))) {
      showToast("先在输入栏选一个项目目录");
      return;
    }
    if (work !== cwd) setCwd(work);
    setChat(emptyChat());
    setDraft("");
    echoedUser.current = false;
    try {
      await ensureAgent();
      await setWorkspace(work);
      await createAcpSession(work);
      setSettingsOpen(false);
    } catch (e) {
      showToast(String(e));
    }
  }

  async function resumeSession(s: SessionSummary) {
    if (split?.id === s.id) {
      setSplit(null);
      setSplitDraft("");
      setSplitBusy(false);
    }
    const last = s.cwd === INBOX_PIN || (inboxCwd && sameCwd(s.cwd, inboxCwd)) ? INBOX_PIN : s.cwd;
    setLastWorkspace(last);
    persist({ lastWorkspace: last });
    const token = ++loadGen.current;
    if (s.cwd !== cwd) setCwd(s.cwd);
    setOpenProjects((m) => ({ ...m, [projectForSession(s.cwd, projects, inboxCwd).path]: true }));
    adoptSession(s.id);
    setDraft(getDraft(sessionDrafts, s.id));
    if (s.parentSessionId) {
      const pid = s.parentSessionId;
      setCollapsedIds((prev) => {
        const n = new Set(prev);
        n.delete(pid);
        return n;
      });
      setExpandedIds((prev) => new Set(prev).add(pid));
    }
    echoedUser.current = false;
    setAtBottom(true);
    setLoadingSession(true);
    setSettingsOpen(false);
    lastActivityRef.current = Date.now();
    setUnread((prev) => {
      const next = clearUnread(prev, s.id);
      if (next !== prev) persist({ unread: next });
      return next;
    });
    try {
      const rows = await readSessionUpdates(s.id);
      if (token !== loadGen.current) return;
      const next = hydrateFromUpdates(rows);
      setChat(next);
      void refreshUsage(s.id);
      setLoadingSession(false);
      ignoreReplay.current = true;
      try {
        await ensureAgent();
        await setWorkspace(s.cwd, s.id);
        try {
          await rpc("session/resume", { sessionId: s.id, cwd: s.cwd, mcpServers: [] });
        } catch {
          await rpc("session/load", { sessionId: s.id, cwd: s.cwd, mcpServers: [] });
        }
      } finally {
        ignoreReplay.current = false;
      }
    } catch (e) {
      if (token !== loadGen.current) return;
      showToast(String(e));
    } finally {
      if (token === loadGen.current) setLoadingSession(false);
    }
  }

  async function openSplit(s: SessionSummary) {
    if (s.id === sessionIdRef.current) {
      showToast("已在当前窗口");
      return;
    }
    setMenu(null);
    review.close();
    persist(persistReviewOpen(false));
    setSplitDraft("");
    setSplitBusy(false);
    setSplitAtBottom(true);
    echoedSplitUser.current = false;
    try {
      const rows = await readSessionUpdates(s.id);
      const next = hydrateFromUpdates(rows);
      setSplit({ id: s.id, cwd: s.cwd, chat: next });
      void refreshUsage(s.id, "split");
      ignoreSplitReplay.current = true;
      try {
        await ensureAgent();
        await setWorkspace(s.cwd, s.id);
        try {
          await rpc("session/resume", { sessionId: s.id, cwd: s.cwd, mcpServers: [] });
        } catch {
          await rpc("session/load", { sessionId: s.id, cwd: s.cwd, mcpServers: [] });
        }
      } finally {
        ignoreSplitReplay.current = false;
      }
    } catch (e) {
      showToast(String(e));
    }
  }

  async function removeSession(s: SessionSummary) {
    if (!window.confirm(`删除会话「${displayTitle(s, titles)}」？`)) return;
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
      if (split?.id === s.id) {
        setSplit(null);
        setSplitDraft("");
        setSplitBusy(false);
      }
      await refreshAllSessions();
    } catch (e) {
      showToast(String(e));
    }
  }

  async function sendSlashToAgent(text: string, dest: "main" | "split" = "main") {
    await ensureAgent();
    if (dest === "split") {
      const sid = split?.id;
      if (!sid) return;
      setSplitBusy(true);
      await rpc(
        "session/prompt",
        { sessionId: sid, prompt: [{ type: "text", text }] },
        { dest: "split" },
      );
      return;
    }
    let sid = sessionIdRef.current;
    if (!sid) sid = await createAcpSession(cwd || inboxCwd || ".");
    beginMainRun(sid);
    await rpc(
      "session/prompt",
      { sessionId: sid, prompt: [{ type: "text", text }] },
      { dest: "main" },
    );
  }

  /**
   * Mode is a CLI-level default, but the slash that applies it belongs to one
   * session — so the pane that asked for the change is the pane that gets it.
   */
  async function applyMode(next: Mode, dest: "main" | "split" = "main") {
    setMode(next);
    persist({ mode: next });
    const paneBusy = dest === "split" ? splitBusy : mainPaneBusy;
    const live =
      dest === "split"
        ? !!(split?.id && readyRef.current)
        : !!(sessionIdRef.current && readyRef.current && !loadingSession);
    if (live && paneBusy) {
      showToast("将在下一轮生效");
      return;
    }
    if (live) {
      try {
        await sendSlashToAgent(slashForMode(next), dest);
      } catch (e) {
        if (dest === "split") setSplitBusy(false);
        else setBusy(false);
        showToast(String(e));
      }
      return;
    }
    showToast(`已记下 ${modeLabel(next)}，下一轮会话生效`);
  }

  function applySessionModel(next: string) {
    if (sessionIdRef.current && readyRef.current) {
      void sendPrompt(`/model ${next}`);
      showToast(`已发送 /model ${next}`);
      return;
    }
    applyModel(next);
  }

  function applyModel(next: string) {
    setModel(next);
    void patchCliSettings({ model: next })
      .then(() => {
        setCli((prev) => (prev ? { ...prev, model: next } : prev));
        if (sessionModel && sessionModel !== next) {
          showToast(`已写入默认模型，当前会话仍是 ${sessionModel}。用 /model 可切换本会话。`);
        }
      })
      .catch((e) => showToast(String(e)));
  }

  function applyEffort(next: Effort) {
    if (!cli) return;
    void patchCliSettings({ effort: next })
      .then(() => {
        setCli((prev) => (prev ? { ...prev, effort: next } : prev));
      })
      .catch((e) => showToast(String(e)));
  }

  const effort = normalizeEffort(cli?.effort);

  async function runSlash(cmd: CommandDef, rest = "", dest: "main" | "split" = "main") {
    if (dest === "split") {
      if (cmd.local === "plan" || cmd.local === "yolo" || cmd.local === "auto") {
        setSplitDraft("");
        return applyMode(cmd.local === "auto" ? "agent" : cmd.local, "split");
      }
      if (cmd.local) {
        showToast("这条命令请在左侧会话执行");
        return;
      }
      splitComposerRef.current?.setText(cmd.name + " ");
      return;
    }
    if (cmd.local === "new") return startSession();
    if (cmd.local === "settings") return openSettings();
    if (cmd.local === "hub") {
      setDraft("");
      return openHub(cmd.hubTab ?? "skills");
    }
    if (cmd.local === "session-info") {
      setDraft("");
      const text = formatSessionInfo({
        id: sessionIdRef.current || "—",
        cwd: cwd || inboxCwd,
        model: sessionModel ?? model,
        title: currentTitleRef.current,
        turns: chat.items.filter((i) => i.kind === "user").length,
        usage: chat.usage,
      });
      void navigator.clipboard.writeText(text).then(() => showToast("已复制会话信息"));
      return;
    }
    if (cmd.local === "export") {
      setDraft("");
      const text = exportTranscript(chat.items);
      void navigator.clipboard.writeText(text).then(() => showToast("已复制导出会话"));
      return;
    }
    if (cmd.local === "copy") {
      setDraft("");
      const text = lastAssistantText(chat.items);
      if (!text) {
        showToast("还没有可复制的回复");
        return;
      }
      void navigator.clipboard.writeText(text).then(() => showToast("已复制上一条回复"));
      return;
    }
    if (cmd.local === "fork") {
      setDraft("");
      return void sendPrompt("/fork");
    }
    if (cmd.local === "rewind") {
      setDraft("");
      if (rewindIndex.lastEdit >= 0) {
        setRewindTarget(rewindIndex.lastEdit);
        showToast("文件还原用「回到这里」；对话回退请确认对话框。也可发 /rewind");
        return;
      }
      return void sendPrompt("/rewind");
    }
    if (cmd.local === "dashboard") {
      setDraft("");
      setExtraPage("dashboard");
      return;
    }
    if (cmd.local === "imagine" || cmd.local === "imagine-video") {
      setDraft("");
      setExtraPage(cmd.local);
      void listImagineArtifacts(cwd || null).then((paths) => {
        setImagineImages(paths.filter((p) => !/\.(mp4|webm)$/i.test(p)));
        setImagineVideos(paths.filter((p) => /\.(mp4|webm)$/i.test(p)));
      }).catch(() => {});
      return;
    }
    if (cmd.local === "agents") {
      setDraft("");
      setExtraPage("agents");
      void listAgentsDir().then(setAgentRows).catch(() => {});
      return;
    }
    if (cmd.local === "memory") {
      setDraft("");
      setExtraPage("memory");
      return;
    }
    if (cmd.local === "plan") {
      setDraft("");
      return applyMode("plan");
    }
    if (cmd.local === "yolo") {
      setDraft("");
      return applyMode("yolo");
    }
    if (cmd.local === "auto") {
      setDraft("");
      return applyMode("agent");
    }
    if (cmd.local === "delete" && sessionId) {
      const s = sessions.find((x) => x.id === sessionId);
      if (s) return removeSession(s);
    }
    if (cmd.local === "rename") {
      setDraft("");
      const parsed = parseRenameArgs(rest);
      if (parsed.kind === "error") {
        showToast(parsed.message);
        return;
      }
      const id = sessionIdRef.current;
      if (!id) {
        showToast("没有可重命名的会话");
        return;
      }
      if (parsed.kind === "auto") {
        restoreGenerated(id);
        return;
      }
      if (parsed.kind === "title") {
        const next = setTitleOverride(titles, id, parsed.title);
        setTitles(next);
        persist({ titles: next });
        return;
      }
      beginEditTitle();
      return;
    }
    composerRef.current?.setText(cmd.name + " ");
  }

  /**
   * Inject a message into the turn that is already running. The agent decides
   * when to read it; the tool call in flight is not cancelled. If the CLI
   * refuses a second prompt on a live session we fall back to the queue rather
   * than losing the message.
   */
  async function steerPrompt(text: string, dest: "main" | "split" = "main") {
    const sid = dest === "split" ? split?.id : sessionIdRef.current;
    if (!sid) {
      queuePrompt(text, dest);
      return;
    }
    const echo = (prev: ChatState): ChatState => ({
      ...prev,
      items: [...prev.items, { kind: "user", id: `u-steer-${prev.nextId}`, text, at: Date.now() }],
      nextId: prev.nextId + 1,
    });
    if (dest === "split") {
      echoedSplitUser.current = true;
      setSplit((prev) => (prev ? { ...prev, chat: echo(prev.chat) } : prev));
      setSplitDraft("");
    } else {
      echoedUser.current = true;
      setChat(echo);
      setDraft("");
    }
    try {
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest });
    } catch (e) {
      showToast(`改向失败，已改为排队：${String(e)}`);
      queuePrompt(text, dest);
    }
  }

  function queuePrompt(text: string, dest: "main" | "split" = "main") {
    if (dest === "split") {
      const next = enqueue(splitQueueRef.current, text);
      if (next === splitQueueRef.current) {
        showToast("队列已满，等这一轮结束");
        return;
      }
      splitQueueRef.current = next;
      setSplitQueue(next);
      setSplitDraft("");
      return;
    }
    const next = enqueue(queueRef.current, text);
    if (next === queueRef.current) {
      showToast("队列已满，等这一轮结束");
      return;
    }
    queueRef.current = next;
    setQueue(next);
    setDraft("");
    if (sessionIdRef.current) {
      const drafts = writeDraft(sessionDrafts, sessionIdRef.current, "");
      setSessionDrafts(drafts);
      persist({ drafts });
    }
  }

  /** The action the send button performs while a turn is running. */
  function submitPrompt(text: string, dest: "main" | "split" = "main") {
    if (!text.trim()) return;
    const paneBusy = dest === "split" ? splitBusy : mainPaneBusy;
    if (!paneBusy) {
      void sendPrompt(text, dest);
      return;
    }
    if (steerByDefault) void steerPrompt(text, dest);
    else queuePrompt(text, dest);
  }

  /** The other one, offered next to it. */
  function altSubmit(text: string, dest: "main" | "split" = "main") {
    if (!text.trim()) return;
    if (steerByDefault) queuePrompt(text, dest);
    else void steerPrompt(text, dest);
  }

  async function sendPrompt(text: string, dest: "main" | "split" = "main") {
    const toSplit = dest === "split";
    if (!text.trim() || loadingSession) return;
    if (toSplit ? splitBusy : busy) return;
    if (!toSplit && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, chat.commands).find((c) => c.name === name);
      if (found?.local) {
        setDraft("");
        return runSlash(found, text.slice(name.length).trimStart());
      }
    }
    if (toSplit && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, split?.chat.commands ?? []).find((c) => c.name === name);
      if (found?.local) {
        setSplitDraft("");
        return runSlash(found, text.slice(name.length).trimStart(), "split");
      }
    }
    if (toSplit) {
      const sid = split?.id;
      if (!sid) return;
      setSplit((prev) =>
        prev
          ? {
              ...prev,
              chat: {
                ...prev.chat,
                items: [...prev.chat.items, { kind: "user", id: `u-local-${prev.chat.nextId}`, text, at: Date.now() }],
                nextId: prev.chat.nextId + 1,
              },
            }
          : prev,
      );
      setSplitDraft("");
      setSplitBusy(true);
      setSplitAtBottom(true);
      echoedSplitUser.current = true;
      pendingPrompt.current = "split";
      try {
        await ensureAgent();
        if (split?.cwd) await setWorkspace(split.cwd, sid);
        await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest: "split" });
      } catch (e) {
        setSplitBusy(false);
        showToast(String(e));
      }
      return;
    }
    echoedUser.current = true;
    setChat((prev) => ({
      ...prev,
      items: [...prev.items, { kind: "user", id: `u-local-${prev.nextId}`, text, at: Date.now() }],
      nextId: prev.nextId + 1,
    }));
    setDraft("");
    if (sessionIdRef.current) {
      const nextDrafts = writeDraft(sessionDrafts, sessionIdRef.current, "");
      setSessionDrafts(nextDrafts);
      persist({ drafts: nextDrafts });
    }
    setAtBottom(true);
    pendingPrompt.current = "main";
    try {
      await ensureAgent();
      let sid = sessionIdRef.current;
      if (!sid) sid = await createAcpSession(cwd || inboxCwd || ".");
      beginMainRun(sid);
      if (cwd) await setWorkspace(cwd, sid);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest: "main" });
    } catch (e) {
      setBusy(false);
      showToast(String(e));
    }
  }

  async function cancelTurn(target: "main" | "split" = "main") {
    const sid = target === "split" ? split?.id : runningSessionIdRef.current;
    try {
      if (sid) await sendRaw({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sid } });
      const selected = panePermissions[target];
      if (selected) { await sendRaw({ jsonrpc: "2.0", id: selected.rpcId, result: { outcome: { outcome: "cancelled" } } }); setPermissions((q) => removePermission(q, selected)); }
    } finally { if (target === "split") setSplitBusy(false); else setBusy(false); }
  }
  async function answerPermission(request: QueuedPermission, optionId: string) {
    try { await sendRaw({ jsonrpc: "2.0", id: request.rpcId, result: { outcome: { outcome: "selected", optionId } } }); }
    finally { setPermissions((q) => removePermission(q, request)); }
  }
  useEffect(() => {
    for (const request of permissions) { const sid = request.sessionId || sessionId; const tool = parseToolName(request.title, request.toolKind); if (!shouldSkipPermission(allowedTools, sid, tool)) continue; const pick = findAlwaysOption(request.options) ?? pickAllowOption(request.options); if (pick) void answerPermission(request, pick); }
  }, [permissions, allowedTools, sessionId]);
  useEffect(() => { const request = permissions[permissions.length - 1]; if (!request || !shouldNotify({ reason: "permission", focused: focusedRef.current })) return; const { title, body } = notifyText("permission", currentTitleRef.current, request.title); void notify(title, body); }, [permissions.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isEditableShortcutTarget(e.target as Element | null)) return; const request = selectShortcutPermission(permissions, permissionContext, focusedPermissionPaneRef.current); if (!request) return; const n = Number(e.key); if (n >= 1 && n <= request.options.length) { e.preventDefault(); void answerPermission(request, request.options[n - 1].optionId); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [permissions, sessionId, runningSessionId, split?.id, busy, splitBusy]);

  function onDraftChange(value: string) {
    setDraft(value);
    if (!sessionId) return;
    const next = writeDraft(sessionDrafts, sessionId, value);
    setSessionDrafts(next);
    persist({ drafts: next });
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
  const splitSession = split
    ? sessions.find((s) => s.id === split.id) ?? inboxSessions.find((s) => s.id === split.id) ?? null
    : null;
  const splitTitle = splitSession ? displayTitle(splitSession, titles) : "并列会话";
  const userTurns = chat.items.filter((i): i is Extract<ChatItem, { kind: "user" }> => i.kind === "user");
  const splitTurns = split
    ? split.chat.items.filter((i): i is Extract<ChatItem, { kind: "user" }> => i.kind === "user")
    : [];
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

  const busyIds = useMemo(() => {
    const ids: string[] = [];
    if (busy && runningSessionId) ids.push(runningSessionId);
    if (splitBusy && split?.id) ids.push(split.id);
    return ids;
  }, [busy, runningSessionId, splitBusy, split?.id]);

  const statusFor = useCallback(
    (id: string): SessionStatus => deriveStatus({ id, busyIds, awaitingId, unread }),
    [busyIds, awaitingId, unread],
  );

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
    enabled: !settingsOpen && !menu && !paletteOpen,
    sessionIds: visibleHotkeySessions,
    onOpenIndex: (i) => {
      const id = visibleHotkeySessions[i];
      if (!id) return;
      const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
      if (s) void resumeSession(s);
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

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [
      { id: "act:new-chat", label: "新对话", group: "操作", hint: "不绑目录" },
      { id: "act:new-session", label: "在当前项目新开会话", group: "操作" },
      { id: "act:settings", label: "打开设置", group: "操作" },
      { id: "act:hub-skills", label: "扩展中心 · 技能", group: "操作", hint: "/skills" },
      { id: "act:hub-mcp", label: "扩展中心 · MCP", group: "操作", hint: "/mcps" },
      { id: "act:hub-plugins", label: "扩展中心 · 插件", group: "操作", hint: "/plugins" },
      { id: "act:hub-hooks", label: "扩展中心 · Hooks", group: "操作", hint: "/hooks" },
      { id: "act:hub-market", label: "扩展中心 · 市场", group: "操作", hint: "/marketplace" },
      { id: "act:fork", label: "分叉会话", group: "操作", hint: "/fork" },
      { id: "act:export", label: "导出会话", group: "操作", hint: "/export" },
      { id: "act:theme", label: "切换浅色 / 深色", group: "操作" },
      { id: "act:panel", label: "审阅", group: "操作" },
      { id: "act:context", label: "计划与规则", group: "操作" },
      { id: "act:dashboard", label: "会话总览", group: "操作" },
      { id: "act:imagine", label: "图片", group: "操作" },
      { id: "act:agents", label: "代理", group: "操作" },
      { id: "act:memory", label: "记忆", group: "操作" },
      { id: "act:usage", label: "用量", group: "操作" },
      { id: "act:add-project", label: "添加项目…", group: "操作" },
    ];
    if (git?.isRepo) {
      out.push({ id: "act:worktree", label: "在新 worktree 里开会话", group: "操作" });
    }
    if (cwd) out.push({ id: "act:finder", label: "在访达中打开工作目录", group: "操作" });
    for (const s of allSessions.slice(0, 60)) {
      out.push({
        id: `session:${s.id}`,
        label: displayTitle(s, titles),
        hint: basename(s.cwd),
        group: "会话",
      });
    }
    for (const p of projects) {
      out.push({ id: `project:${p}`, label: basename(p), hint: p, group: "项目" });
    }
    for (const c of chat.commands) {
      out.push({ id: `slash:${c.name}`, label: c.name, hint: c.hint, group: "命令" });
    }
    return out;
  }, [allSessions, projects, chat.commands, titles, cwd, git?.isRepo]);

  function runPaletteItem(id: string) {
    setPaletteOpen(false);
    const [kind, ...rest] = id.split(":");
    const arg = rest.join(":");
    if (kind === "session") {
      const s = allSessions.find((x) => x.id === arg);
      if (s) void resumeSession(s);
      return;
    }
    if (kind === "project") {
      void selectProject(arg);
      return;
    }
    if (kind === "slash") {
      const cmd = filterCommands(arg, chat.commands).find((c) => c.name === arg);
      if (cmd) void runSlash(cmd);
      else composerRef.current?.setText(`${arg} `);
      return;
    }
    switch (arg) {
      case "new-chat":
        void startNewChat();
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
        openHub("plugins");
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
        openReview("context");
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
  }

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
  const permissionContext = { mainSessionId: sessionId, runningMainSessionId: runningSessionId, splitSessionId: split?.id ?? null, mainBusy: busy, splitBusy };
  const panePermissions = selectPanePermissions(permissions, permissionContext);
  const mainPermission = panePermissions.main; const splitPermission = panePermissions.split;
  const mainPermissionView = derivePermissionView({ ...permissionContext, request: mainPermission });
  const splitPermissionView = derivePermissionView({ ...permissionContext, request: splitPermission });
  const splitMentions = selectPaneMentionSource(split?.cwd ?? "", splitMentionData);
  const stallText = mainPaneBusy ? stallNote(Date.now() - lastActivityRef.current) : "";
  const takeover = paneComposerTakeover({ pane: "main", pendingPane: mainPermissionView.pane, pendingKind: mainPermissionView.kind, plan: !!planComplete });
  const splitTakeover = paneComposerTakeover({ pane: "split", pendingPane: splitPermissionView.pane, pendingKind: splitPermissionView.kind, plan: false });
  const hero = heroLayout({ hasMessages: chat.items.length > 0, hasCwd: !!cwd });
  const turnFiles = lastTurnFiles(chat.items);
  const ctxCounts = contextSummary({
    mcp: inspect ? enabledMcpCount(inspect.mcpServers) : 0,
    lsp: inspect?.lspServers.length ?? 0,
    rules: rules.length,
    sandboxOn: mode === "yolo",
  });
  const terminalTools = bashTools(chat.items);
  const reviewTabs = deriveReviewTabs({ planCount: plan.length, fileCount: turnFiles.length, changeCount: changes.length, contextCount: (planFile ? 1 : 0) + rules.length, hasDetails: !!detailsTool, hasPreview: !!previewPath, bashCount: terminalTools.length });
  const reconciledReviewTab = reconcileReviewTab(reviewTab, reviewTabs, defaultRail);
  useEffect(() => {
    if (reconciledReviewTab !== reviewTab) review.setTab(reconciledReviewTab);
  }, [reconciledReviewTab, reviewTab]);
  const jobs = headerJobs(chat.items);
  const catalog = subagentCatalog(chat.items);
  const goal = goalFromPlan(plan);
  const health = agentHealth({ ready, connecting, sawExit });
  const runStatus = deriveRunStatus({ disconnected: health === "disconnected", trustRequired: !!(inspect && cwd && inspect.projectTrusted === false), pending: mainPermissionView.statusPending, running: mainPaneBusy, stalled: !!stallText, stallDetail: stallText, planComplete });
  const turnStats = turnStatsFromItems(chat.items, usage?.output);
  const splitTurnStats = split ? turnStatsFromItems(split.chat.items, split.chat.usage?.output) : null;

  return (
    <div
      className="app"
      style={{
        ["--md-size" as string]: `${chatFontSize}px`,
        ["--sidebar-w" as string]: `${sidebarCollapsed ? SIDEBAR_RAIL : sidebarWidth}px`,
      }}
    >
      <Sidebar
        sections={sidebarSections}
        prefs={sidebarList}
        onPrefs={(next) => {
          setSidebarList(next);
          persist({ sidebarList: next });
        }}
        onSearch={() => setPaletteOpen(true)}
        searchHits={searchHits}
        onOpenHit={(id) => {
          const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
          if (s) void resumeSession(s);
        }}
        onClearHits={() => setSearchHits(null)}
        openProjects={openProjects}
        onToggleProject={(path) => setOpenProjects((m) => ({ ...m, [path]: !m[path] }))}
        onPinProject={(path) => {
          const hit = path === INBOX_PIN ? pinnedProjects.includes(INBOX_PIN) : pinnedProjects.some((p) => sameCwd(p, path));
          const next = hit
            ? pinnedProjects.filter((p) => (path === INBOX_PIN ? p !== INBOX_PIN : !sameCwd(p, path)))
            : [...pinnedProjects, path];
          setPinnedProjects(next);
          persist({ pinnedProjects: next });
        }}
        sessionId={sessionId}
        splitId={split?.id}
        titles={titles}
        expandedIds={expandedIds}
        collapsedIds={collapsedIds}
        onToggleExpand={toggleExpand}
        onOpenSession={(s) => void resumeSession(s)}
        onSessionMenu={(id, el) => openMenu("row", id, el)}
        onNewChat={() => void startNewChat()}
        onAddProject={() => void addProject()}
        picking={picking}
        statusFor={statusFor}
        width={sidebarCollapsed ? SIDEBAR_RAIL : sidebarWidth}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        signedIn={!!info?.authPresent}
        onSettings={() => setSettingsOpen(true)}
        onExtensions={() => openHub()}
        onShortcuts={() => {
          setSettingsOpen(true);
          setSettingsFocus("shortcuts");
        }}
        onCollapseAll={() => {
          setOpenProjects((m) => {
            const next: Record<string, boolean> = {};
            for (const key of Object.keys(m)) next[key] = false;
            for (const section of sidebarSections) {
              next[section.projectPath ?? section.id] = false;
            }
            return next;
          });
          setCollapsedIds((prev) => {
            const next = new Set(prev);
            for (const s of allSessions) {
              if (s.parentSessionId) next.add(s.parentSessionId);
            }
            for (const section of sidebarSections) {
              for (const row of section.rows) {
                if (row.indent === 1 && row.session.parentSessionId) {
                  next.add(row.session.parentSessionId);
                }
              }
            }
            return next;
          });
        }}
        onMarkAllRead={() => {
          setUnread({});
          persist({ unread: {} });
        }}
        showTokens={sidebarList.showTokens}
        showStatus={sidebarList.showStatus}
        showWorktree={sidebarList.showWorktree}
      />
      {!sidebarCollapsed && (
      <Resizer
        ariaLabel="调整侧栏宽度"
        className="sidebar-resizer"
        value={sidebarWidth}
        min={SIDEBAR.min}
        max={maxFor(SIDEBAR, winWidth, previewPath && !split ? previewWidth : 0)}
        resetTo={SIDEBAR.initial}
        onChange={setSidebarWidth}
        onCommit={(n) => persist({ sidebarWidth: n })}
      />
      )}

      <main className={`workspace${split ? " split" : ""}${!sessionId || hero.hero ? " new-chat-hero" : ""}`}>
        {health === "disconnected" && (
          <div className="trust-banner" role="alert">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void ensureAgent().catch((e) => showToast(String(e)));
              }}
            >
              重启 grok agent
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSettingsOpen(true);
                void runGrokStream(["mcp", "doctor", "--json"], cwd || null).then((r) => {
                  setDoctorNote((r.stdout || r.stderr || "").slice(-4000));
                });
              }}
            >
              doctor
            </button>
          </div>
        )}
        {connecting && !ready && (
          <div className="trust-banner" role="status">正在连接 grok agent…</div>
        )}
        {inspect && cwd && inspect.projectTrusted === false && (
          <div className="trust-banner" role="status">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void trustFolder(cwd, true).then(() => {
                  void refreshInspect();
                  showToast("已信任此文件夹");
                });
              }}
            >
              {t(locale, "trust.action")}
            </button>
          </div>
        )}
        <div className={split ? "pane" : "pane solo"}>
          <div className="pane-body">
          <div className="work-col">
          <header className="workspace-head">
            <div className="title-wrap">
              <MenuSelect
                variant="inline"
                className="crumb-cwd"
                ariaLabel="工作目录"
                title={cwdLocked ? "项目内对话开始后不能再换目录" : "选择工作目录"}
                disabled={cwdLocked}
                value={cwd || inboxCwd}
                options={[
                  ...(inboxCwd ? [{ value: inboxCwd, label: "无目录" }] : []),
                  ...projects.map((p) => ({ value: p, label: basename(p), hint: p })),
                ]}
                onChange={(next) => void switchWorkdir(next)}
              />
              <span className="crumb-sep">/</span>
              {editingTitleId && sessionId && editingTitleId === sessionId ? (
                <input
                  ref={titleInputRef}
                  className="title-input"
                  value={titleDraft}
                  maxLength={80}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle(titleDraft);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditTitle();
                    }
                  }}
                  onBlur={() => {
                    if (titleDraft.trim() && titleDraft.trim() !== currentTitle) commitTitle(titleDraft);
                    else cancelEditTitle();
                  }}
                />
              ) : sessionId ? (
                <>
                  <button
                    type="button"
                    className="session-title-btn"
                    title={currentTitle}
                    onClick={() => beginEditTitle(sessionId)}
                  >
                    {currentTitle}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-menu-trigger
                    aria-label="会话操作"
                    onClick={(e) => openMenu("header", sessionId, e.currentTarget)}
                  >
                    <IconChevron />
                  </button>
                  <button
                    type="button"
                    className="btn ghost fork-btn"
                    title="分叉会话"
                    aria-label="分叉会话"
                    onClick={() => void sendPrompt("/fork")}
                  >
                    分叉
                  </button>
                </>
              ) : (
                <span className="title-static">新会话</span>
              )}
            </div>
            <div className="head-actions">
              {!split && (
                <GitBar
                  status={git}
                  busy={worktreeBusy}
                  onOpenChanges={() => openReview("changed-file")}
                  onNewWorktree={() => void newWorktreeSession()}
                />
              )}
              <UsageRing
                usage={usage ?? {}}
                compactPercent={cli?.compactPercent ?? 85}
              />
              {jobs.length > 0 && (
                <div className="chip-wrap">
                  <button type="button" className="btn ghost" aria-expanded={jobsOpen} onClick={() => setJobsOpen((o) => !o)}>
                    任务 {jobs.length}
                  </button>
                  {jobsOpen ? (
                    <div className="chip-menu" role="menu">
                      {jobs.map((j) => (
                        <button key={j.id} type="button" onClick={() => setJobsOpen(false)}>{j.title}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {catalog.length > 0 && (
                <div className="chip-wrap">
                  <button type="button" className="btn ghost" aria-expanded={catalogOpen} onClick={() => setCatalogOpen((o) => !o)}>
                    子代理 {catalog.length}
                  </button>
                  {catalogOpen ? (
                    <div className="chip-menu" role="menu">
                      {catalog.map((s) => (
                        <button key={s.id} type="button" onClick={() => setCatalogOpen(false)}>{s.name} · {s.status}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {!split && (
                <button
                  type="button"
                  className="icon-btn"
                  title="审阅"
                  aria-label="审阅"
                  aria-expanded={reviewOpen}
                  onClick={() => {
                    const next = !reviewOpen;
                    review.toggle(defaultRail);
                    persist(persistReviewOpen(next));
                  }}
                >
                  <IconPanel />
                </button>
              )}
            </div>
          </header>
          <div className="chat-shell">
            <ThreadColumn
              paneId="main"
              chat={chat}
              chatWidth={chatWidth}
              dark={theme === "dark"}
              cwd={cwd}
              showThinking={showThinking}
              empty={chat.items.length === 0 && !loadingSession}
              emptyTitle=""
              emptyNode={
                <EmptyState
                  info={info}
                  cwd={cwd}
                  projectCount={projects.length}
                  onPickProject={() => void addProject()}
                  onInbox={() => void startInboxSession()}
                  onCopyLogin={() => {
                    void navigator.clipboard.writeText(GROK_LOGIN_CMD);
                    showToast("已复制 grok login");
                  }}
                  onBrowseWorkspace={() => setMillerOpen(true)}
                />
              }
              urlChips={urlChips}
              plan={plan}
              busy={mainPaneBusy}
              onCancel={() => void cancelTurn("main")}
              onOpenPlan={split ? null : () => {
                openReview("plan");
              }}
              sessionModel={sessionModel}
              chatRef={chatEl}
              onScroll={(el) => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)}
              turns={userTurns}
              onResendUser={(text) => submitPrompt(text)}
              rewindFor={rewindForItem}
              onForkTurn={() => void sendPrompt(forkAtSlash())}
              onInspectTool={review.inspectTool}
              onPreviewPath={split ? undefined : (p) => void openPreview(p)}
              highlightQuery={searchJump}
              jumpId={jumpTurnId}
              threadView={threadView}
              onThreadView={setThreadView}
              turnFiles={turnFiles}
              onOpenTurnFile={(path) => void review.openTurnFile(path)}
            />
            {!atBottom && chat.items.length > 0 && (
              <button
                type="button"
                className="jump-bottom"
                title="回到底部"
                aria-label="回到底部"
                onClick={() => {
                  setAtBottom(true);
                  chatEl.current?.scrollTo({ top: chatEl.current.scrollHeight, behavior: "smooth" });
                }}
              >
                <IconChevron size={16} />
              </button>
            )}
          </div>
          {loadingSession && (
            <div className="overlay">
              <div className="spinner" />
              <div>正在载入会话…</div>
            </div>
          )}
          <Composer
            ref={composerRef}
            value={draft}
            onChange={onDraftChange}
            onSend={(text) => submitPrompt(text)}
            onAlt={(text) => altSubmit(text)}
            altLabel={steerByDefault ? "排队" : "改向"}
            busy={mainPaneBusy}
            blocked={hero.blocked || loadingSession}
            takeover={takeover}
            busyHint={busyComposerHint(steerByDefault)}
            agents={hero.hero ? agentRows : undefined}
            onPickAgent={hero.hero ? (name) => void sendPrompt(`/config-agents ${name}`) : undefined}
            enterSends={enterSends}
            threadWidth={`${chatWidth}px`}
            commands={chat.commands}
            onRunSlash={(cmd, rest) => void runSlash(cmd, rest)}
            cwd={cwd}
            listFiles={(q) => listProjectFiles(cwd, q)}
            mentionDirs={workspaceEntries.filter((e) => e.kind === "dir").map((e) => e.name)}
            mentionChanges={changes.map((c) => c.path)}
            mode={mode}
            onMode={(m) => void applyMode(m, "main")}
            effort={effort}
            onEffort={applyEffort}
            effortReady={!!cli}
            model={model}
            sessionModel={sessionModel}
            modelOptions={modelCatalog}
            onModel={applyModel}
            onSessionModel={applySessionModel}
            onOpenSettings={openSettings}
            onManageSkills={() => openHub("skills")}
            queue={queue}
            onRemoveQueued={(id) => setQueue((q) => removeQueued(q, id))}
            onReorderQueued={(from, to) => setQueue((q) => reorderQueue(q, from, to))}
            onEditQueued={(id, text) => setQueue((q) => editQueued(q, id, text))}
            onOverflow={showToast}
            workspaceLabel={inboxCwd && cwd && sameCwd(cwd, inboxCwd) ? "独立对话" : cwd ? basename(cwd) : ""}
            workspaceOptions={[
              ...(inboxCwd ? [{ path: INBOX_PIN, label: "独立对话" }] : []),
              ...projects.map((p) => ({ path: p, label: basename(p) })),
            ]}
            onWorkspace={(path) => {
              const last = path === INBOX_PIN ? INBOX_PIN : path;
              setLastWorkspace(last);
              persist({ lastWorkspace: last });
              if (sessionId) return;
              const folder = path === INBOX_PIN ? inboxCwd : path;
              if (!folder) return;
              setCwd(folder);
              void setWorkspace(folder).catch((e) => showToast(String(e)));
            }}
            footer={<StatsLineView stats={turnStats} sessionTokens={usage?.used} />}
          >
            <RunStatusRegion status={runStatus} />
            {goal ? <GoalBar goal={goal} /> : null}
            {memoryChanges.length > 0 && (
              <MemoryDock
                changes={memoryChanges}
                onOpen={(p) => {
                  void openPreview(p);
                  memoryBaseline.current = {
                    ...memoryBaseline.current,
                    ...snapshotMtimes(memoryChanges),
                  };
                  setMemoryChanges([]);
                }}
                onDismiss={() => {
                  memoryBaseline.current = {
                    ...memoryBaseline.current,
                    ...snapshotMtimes(memoryChanges),
                  };
                  setMemoryChanges([]);
                }}
              />
            )}
            <DiffSummary
              items={chat.items}
              onOpen={() => {
                openReview("changed-file");
              }}
            />
            {subagentCards.map((s) =>
              s.status ? (
                <SubagentCard key={s.id} name={s.name} status={s.status} mcpInheritance="inherit" />
              ) : null,
            )}
            {planComplete ? (
              <PlanCompleteCard
                onApprove={() => void applyMode("agent")}
                onReject={() => showToast("已拒绝执行计划")}
                onFeedback={(text) => void sendPrompt(text)}
              />
            ) : null}
            {mainPermission && mainPermissionView.mainVisible && mainPermissionView.kind && (
              <PendingRequestCard
                kind={mainPermissionView.kind}
                title={mainPermission.title}
                options={mainPermission.options}
                timedOut={mainPermission.timedOut}
                timeoutNotice={permissionTimeoutNotice()}
                onPick={(id) => void answerPermission(mainPermission, id)}
                onAlwaysAllow={mainPermissionView.kind === "permission" ? () => {
                  const sid = mainPermission.sessionId || sessionId;
                  const tool = parseToolName(mainPermission.title, mainPermission.toolKind);
                  if (sid) setAllowedTools((prev) => allowForSession(prev, sid, tool));
                  const pick = findAlwaysOption(mainPermission.options) ?? pickAllowOption(mainPermission.options);
                  if (pick) void answerPermission(mainPermission, pick);
                } : undefined}
              />
            )}
          </Composer>
          </div>

          {!split && reviewOpen ? (
            <>
              <Resizer
                ariaLabel="调整审阅栏宽度" value={previewWidth} min={PREVIEW.min}
                max={maxFor(PREVIEW, winWidth, sidebarWidth)} resetTo={PREVIEW.initial} direction={-1}
                onChange={setPreviewWidth} onCommit={(n) => persist({ previewWidth: n })}
              />
              <ReviewRail activeTab={reconciledReviewTab} tabs={reviewTabs} width={previewWidth}
                onTab={review.setTab} onHome={() => review.setTab("home")} onClose={() => { review.close(); persist(persistReviewOpen(false)); }}>
                {{
                  home: <ReviewHome onOpen={(tab) => review.setTab(tab)} />,
                  progress: plan.length > 0 ? <ul className="todo">{plan.map((e, i) => <li key={`${e.content}-${i}`} className={e.status || "pending"}><span className="box">{e.status === "completed" ? <IconCheck size={10} /> : e.status === "in_progress" ? "•" : ""}</span>{e.content}</li>)}</ul> : <p className="float-empty">本轮还没有进度。</p>,
                  files: turnFiles.length > 0 ? <FilePanel artifacts={turnFiles.map((path) => ({ path }))} cwd={cwd} onOpenPath={(p) => void review.revealPath(p)} onPreview={(p) => void openPreview(p)} /> : <p className="float-empty">本轮还没有文件。</p>,
                  changes: <div className="review-stack"><ChangesPanel changes={changes} isRepo={!!git?.isRepo} onPreview={(p) => void openPreview(p)} onReveal={(p) => void review.revealPath(p)} onRefresh={() => void refreshGit()} /><GitHistory commits={gitCommits} branches={gitBranchList} /></div>,
                  context: <div className="ctx-counts" aria-label="上下文计数"><p>MCP {ctxCounts.mcp}</p><p>LSP {ctxCounts.lsp}</p><p>规则 {ctxCounts.rules}</p><p>沙盒 {ctxCounts.sandbox ? "始终批准" : "按许可"}</p><button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>打开设置</button></div>,
                  details: <DetailsPanel tool={detailsTool} onOpenPath={(p) => void openPreview(p)} />,
                  preview: previewPath ? <PreviewPane path={previewPath} text={previewText} truncated={previewTruncated} error={previewError} cwd={cwd} dark={theme === "dark"} embedded onReveal={(p) => void review.revealPath(p)} onFollowLink={(e) => handleMdClick(e, cwd, (p) => void openPreview(p))} onSave={(p, text) => { void writeAllowedText(p, text, cwd || null).then(() => { review.setPreviewText(p, review.preview.requestId, text); showToast("已保存"); }).catch((e) => showToast(String(e))); }} /> : <p className="float-empty">选择文件后在此预览。</p>,
                  terminal: (
                    <div className="review-stack">
                      <button type="button" className="btn primary" disabled={!cwd} onClick={() => {
                        if (!cwd) return;
                        void openInTerminal(cwd).catch((e) => showToast(String(e)));
                      }}>在终端打开项目</button>
                      {terminalTools.length === 0 ? (
                        <p className="float-empty">本会话还没有终端工具输出</p>
                      ) : terminalTools.map((tool) => (
                        <button key={tool.id} type="button" className="file-item" onClick={() => review.inspectTool(tool)}>{tool.title}</button>
                      ))}
                    </div>
                  ),
                }}
              </ReviewRail>
            </>
          ) : null}
          </div>
        </div>

        {split && (
          <div className="pane" onFocusCapture={() => { focusedPermissionPaneRef.current = "main"; }}>
            <header className="workspace-head">
              <div className="title-wrap">
                <span className="crumb-cwd" title={split.cwd}>
                  {inboxCwd && sameCwd(split.cwd, inboxCwd) ? "无目录" : basename(split.cwd)}
                </span>
                <span className="crumb-sep">/</span>
                {editingTitleId === split.id ? (
                  <input
                    ref={titleInputRef}
                    className="title-input"
                    value={titleDraft}
                    maxLength={80}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitTitle(titleDraft);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditTitle();
                      }
                    }}
                    onBlur={() => {
                      if (titleDraft.trim() && titleDraft.trim() !== splitTitle) commitTitle(titleDraft);
                      else cancelEditTitle();
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="session-title-btn"
                      title={splitTitle}
                      onClick={() => beginEditTitle(split.id)}
                    >
                      {splitTitle}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      data-menu-trigger
                      aria-label="会话操作"
                      onClick={(e) => openMenu("header", split.id, e.currentTarget)}
                    >
                      <IconChevron />
                    </button>
                  </>
                )}
              </div>
              <div className="head-actions">
                <UsageRing
                  usage={split.chat.usage ?? {}}
                  compactPercent={cli?.compactPercent ?? 85}
                />
                <button
                  type="button"
                  className="icon-btn"
                  title="关闭"
                  aria-label="关闭"
                  onClick={() => {
                    setSplit(null);
                    setSplitDraft("");
                    setSplitBusy(false);
                  }}
                >
                  <IconClose size={14} />
                </button>
              </div>
            </header>
            <div className="chat-shell">
              <ThreadColumn
                paneId="split"
                chat={split.chat}
                chatWidth={chatWidth}
                dark={theme === "dark"}
                cwd={split.cwd}
                showThinking={showThinking}
                empty={split.chat.items.length === 0}
                emptyTitle="并列会话"
                sessionModel={splitSession?.model ?? null}
                urlChips={[]}
                plan={split.chat.plan}
                busy={splitBusy}
                onCancel={() => void cancelTurn("split")}
                onOpenPlan={null}
                chatRef={splitChatEl}
                onScroll={(el) => setSplitAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)}
                turns={splitTurns}
                onResendUser={(text) => submitPrompt(text, "split")}
              />
              {!splitAtBottom && split.chat.items.length > 0 && (
                <button
                  type="button"
                  className="jump-bottom"
                  title="回到底部"
                  aria-label="回到底部"
                  onClick={() => {
                    setSplitAtBottom(true);
                    splitChatEl.current?.scrollTo({ top: splitChatEl.current.scrollHeight, behavior: "smooth" });
                  }}
                >
                  <IconChevron size={16} />
                </button>
              )}
            </div>
            <Composer
              ref={splitComposerRef}
              value={splitDraft}
              onChange={setSplitDraft}
              onSend={(text) => submitPrompt(text, "split")}
              onAlt={(text) => altSubmit(text, "split")}
              altLabel={steerByDefault ? "排队" : "改向"}
              busy={splitBusy}
              takeover={splitTakeover}
              enterSends={enterSends}
              threadWidth={`${chatWidth}px`}
              commands={split.chat.commands}
              onRunSlash={(cmd, rest) => void runSlash(cmd, rest, "split")}
              cwd={split.cwd}
              listFiles={(q) => listProjectFiles(split.cwd, q)}
              mentionDirs={splitMentions.dirs}
              mentionChanges={splitMentions.changes}
              mode={mode}
              onMode={(m) => void applyMode(m, "split")}
              effort={effort}
              onEffort={applyEffort}
              effortReady={!!cli}
              model={model}
              sessionModel={splitSession?.model ?? null}
              modelOptions={modelCatalog}
              onModel={applyModel}
              onSessionModel={applySessionModel}
              onOpenSettings={openSettings}
              onManageSkills={() => openHub("skills")}
              queue={splitQueue}
              onRemoveQueued={(id) => setSplitQueue((q) => removeQueued(q, id))}
              onReorderQueued={(from, to) => setSplitQueue((q) => reorderQueue(q, from, to))}
              onOverflow={showToast}
              footer={<StatsLineView stats={splitTurnStats} sessionTokens={split.chat.usage?.used} />}
            >
              {splitBusy && (
                <WaitPill
                  status={liveWorkStatus(split.chat.items)}
                  elapsed={splitBusyAt != null ? formatElapsed(Date.now() - splitBusyAt + clock * 0) : "0秒"}
                  onStop={() => void cancelTurn("split")}
                />
              )}
              {splitPermission && splitPermissionView.splitVisible && splitPermissionView.kind && (
                <PendingRequestCard
                  kind={splitPermissionView.kind}
                  title={splitPermission.title}
                  options={splitPermission.options}
                  onPick={(id) => void answerPermission(splitPermission, id)}
                  onAlwaysAllow={splitPermissionView.kind === "permission" ? () => {
                    const sid = splitPermission.sessionId || split.id;
                    const tool = parseToolName(splitPermission.title, splitPermission.toolKind);
                    if (sid) setAllowedTools((prev) => allowForSession(prev, sid, tool));
                    const pick = findAlwaysOption(splitPermission.options) ?? pickAllowOption(splitPermission.options);
                    if (pick) void answerPermission(splitPermission, pick);
                  } : undefined}
                />
              )}
            </Composer>
          </div>
        )}

      </main>

      {menu && menuSession && (
        <SessionMenu
          session={menuSession}
          hasOverride={!!titles[menuSession.id]?.trim()}
          top={menu.top}
          left={menu.left}
          onRename={() => {
            const id = menuSession.id;
            setMenu(null);
            if (id === sessionIdRef.current || id === split?.id) {
              beginEditTitle(id);
              return;
            }
            void (async () => {
              const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
              if (s) await resumeSession(s);
              beginEditTitle(id);
            })();
          }}
          onRestore={() => restoreGenerated(menuSession.id)}
          onNew={() => {
            setMenu(null);
            if (inboxCwd && sameCwd(menuSession.cwd, inboxCwd)) void startInboxSession();
            else void startSession(menuSession.cwd);
          }}
          onNewLabel={inboxCwd && sameCwd(menuSession.cwd, inboxCwd) ? "新对话" : "在此项目新开会话"}
          onMoveToProject={
            inboxCwd && sameCwd(menuSession.cwd, inboxCwd) && projects.length > 0
              ? () => {
                  setMovePick({ id: menuSession.id, top: menu.top, left: menu.left });
                  setMenu(null);
                }
              : null
          }
          onReveal={menuSession.dir || menuSession.cwd
            ? () => {
                setMenu(null);
                void openPath(menuSession.dir || menuSession.cwd);
              }
            : null}
          onCopyId={() => {
            void navigator.clipboard.writeText(menuSession.id);
            setMenu(null);
            showToast("已复制");
          }}
          onCopyCwd={() => {
            void navigator.clipboard.writeText(menuSession.cwd);
            setMenu(null);
            showToast("已复制");
          }}
          onSplit={
            menuSession.id !== sessionId && menuSession.id !== split?.id
              ? () => void openSplit(menuSession)
              : null
          }
          onFork={() => {
            const target = menuSession;
            setMenu(null);
            void (async () => {
              if (target.id !== sessionIdRef.current) await resumeSession(target);
              await sendPrompt("/fork");
            })();
          }}
          pinned={isPinned(pinned, menuSession.id)}
          archived={isArchived(archived, menuSession.id)}
          onPin={() => {
            const next = toggleId(pinned, menuSession.id);
            setPinned(next);
            persist({ pinned: next });
            setMenu(null);
          }}
          onArchive={() => {
            const next = toggleId(archived, menuSession.id);
            setArchived(next);
            persist({ archived: next });
            setMenu(null);
          }}
          onDelete={() => void removeSession(menuSession)}
        />
      )}

      {settingsOpen && (
        <div className="settings-layer">
          <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-head">
              <h2 id="settings-title">设置</h2>
              <button type="button" className="icon-btn" aria-label="关闭" title="关闭" onClick={() => setSettingsOpen(false)}>
                <IconClose size={14} />
              </button>
            </div>
            <SettingsPanel
              focusSection={settingsFocus}
              onConsumedFocus={() => setSettingsFocus(null)}
              theme={theme}
              setTheme={(t) => { setTheme(t); persist({ theme: t }); }}
              locale={locale}
              onLocale={(l) => { setLocale(l); persist({ locale: l }); }}
              themeFamily={themeFamily}
              onThemeFamily={(f) => { setThemeFamily(f); persist({ themeFamily: f }); }}
              density={density}
              onDensity={(d) => { setDensity(d); persist({ density: d }); }}
              hideToTray={hideToTray}
              onHideToTray={(v) => { setHideToTray(v); persist({ hideToTray: v }); }}
              defaultRail={defaultRail}
              onDefaultRail={(v) => { setDefaultRail(v); persist({ defaultRail: v }); review.hydrateLegacy({ defaultTab: v }); }}
              inspect={inspect}
              doctorNote={doctorNote}
              onOpenHub={openHub}
              onRefreshHealth={() => {
                void refreshInspect();
                void doctor().then(setInfo);
                void runGrokStream(["mcp", "doctor", "--json"], cwd || null).then((r) => {
                  setDoctorNote((r.stdout || r.stderr || "").slice(-4000));
                });
              }}
              shortcuts={shortcuts}
              onShortcut={(id, binding) => {
                const next = { ...shortcuts, [id]: binding };
                setShortcuts(next);
                persist({ shortcuts: next });
              }}
              managedText={managed?.text}
              managedPath={managed?.path}
              agentReady={ready}
              agentConnecting={connecting}
              agentDisconnected={health === "disconnected"}
              onRestartAgent={() => {
                void ensureAgent().catch((e) => showToast(String(e)));
              }}
              chatWidth={chatWidth}
              setChatWidth={(n) => { setChatWidth(n); persist({ chatWidth: n }); }}
              inboxCwd={inboxCwd}
              onInboxCwd={(path) => {
                setInboxCwd(path);
                persist({ inboxCwd: path });
                void refreshInbox(path);
              }}
              chatFontSize={chatFontSize}
              setChatFontSize={(n) => { setChatFontSize(n); persist({ chatFontSize: n }); }}
              enterSends={enterSends}
              onEnterSends={(v) => { setEnterSends(v); persist({ enterSends: v }); }}
              autoArchiveDays={autoArchiveDays}
              onAutoArchiveDays={(n) => { setAutoArchiveDays(n); persist({ autoArchiveDays: n }); }}
              steerByDefault={steerByDefault}
              onSteerByDefault={(v) => { setSteerByDefault(v); persist({ steerByDefault: v }); }}
              cli={cli}
              onCli={(next) => {
                setCli(next);
                if (next.model) setModel(next.model);
                setShowThinking(next.showThinking);
                if (next.yolo) setMode("yolo");
              }}
              info={info}
            />
          </div>
        </div>
      )}

      <ExtensionsHub
        open={hubOpen}
        tab={hubTab}
        onTab={setHubTab}
        onClose={() => setHubOpen(false)}
        cwd={cwd}
        locale={locale}
        onForwardSlash={(text) => {
          setHubOpen(false);
          composerRef.current?.setText(text);
          void sendPrompt(text);
        }}
      />

      <ExtraOverlay
        page={extraPage}
        onClose={() => setExtraPage(null)}
        onSlash={(cmd) => {
          setExtraPage(null);
          void sendPrompt(cmd);
        }}
        onOpenPath={(p) => {
          setExtraPage(null);
          void openPath(p);
        }}
        onOpenSession={(id) => {
          setExtraPage(null);
          const s = allSessions.find((x) => x.id === id);
          if (s) void resumeSession(s);
        }}
        images={imagineImages}
        videos={imagineVideos}
        agents={agentRows}
        dashboard={[...dashboardSessions]}
        memoryPath={memoryPath}
        agentsPath={agentsMdPath}
        cwd={cwd || inboxCwd}
        usagePoints={usageHistory}
        usageDays={usageDays}
        onUsageDays={setUsageDays}
        subagents={subagentCards.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status ?? "running",
        }))}
      />

      {movePick && (
        <div className="menu" style={{ top: movePick.top, left: movePick.left }} role="menu">
          <div className="footnote" style={{ padding: "6px 10px 4px" }}>移入项目</div>
          {projects.map((p) => (
            <button key={p} type="button" onClick={() => void moveInboxToProject(movePick.id, p)}>
              {basename(p)}
            </button>
          ))}
        </div>
      )}

      {mruOpen && (
        <div className="mru-list" role="listbox">
          {visibleHotkeySessions.map((id, i) => {
            const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
            if (!s) return null;
            return (
              <button
                key={id}
                type="button"
                className={id === sessionId ? "on" : ""}
                onClick={() => {
                  setMruOpen(false);
                  void resumeSession(s);
                }}
              >
                {i + 1} {displayTitle(s, titles)}
              </button>
            );
          })}
        </div>
      )}
      {rewindPreview && rewindTarget != null && (
        <RewindDialog
          open
          plan={rewindPreview.plan}
          rows={rewindPreview.rows}
          onCancel={() => setRewindTarget(null)}
          onConfirm={() => {
            const index = rewindTarget;
            setRewindTarget(null);
            void applyRewind(index);
          }}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          items={paletteItems}
          onPick={runPaletteItem}
          onSearch={(query) => {
            void searchSessionText(query)
              .then((hits) => {
                setSearchHits(hits);
                setSearchJump(query);
                setPaletteOpen(false);
                if (hits.length === 1) {
                  const s = allSessions.find((x) => x.id === hits[0].sessionId);
                  if (s) void resumeSession(s);
                }
              })
              .catch((e) => {
                showToast(String(e));
              });
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {millerOpen && (inboxCwd || cwd) && (
        <MillerPicker
          root={cwd || inboxCwd}
          onPick={(path) => {
            setMillerOpen(false);
            void selectProject(path);
          }}
          onClose={() => setMillerOpen(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
