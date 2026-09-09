import { useCallback, useEffect, useMemo } from "react";
import {
  doctorAll,
  inspectBrief,
  listAgentsDir,
  listImagineArtifacts,
  listWorkspaceEntries,
  openPath,
  openReviewPath,
  readTextFile,
  setWorkspace,
} from "../api";
import { catalogFromSource, emptyCatalog, effortsForModel } from "../lib/agent-models";
import { parseInspect } from "../lib/inspect";
import { MAIN_PANE } from "../lib/pane-tree";
import { persistReviewOpen } from "../lib/review-rail";
import { friendlyError } from "../lib/error-copy";
import { permissionTimeoutNotice } from "../lib/permission-copy";
import { sessionsWithLiveRoster } from "../lib/live-roster";
import { isTextPreviewable } from "../lib/preview";
import { agentSendBlockReason, blockedAgentToast } from "../lib/agent-doctor";
import { subagentChips } from "../lib/subagent-tree";
import { reviewOwnerKey, useReviewController } from "./useReviewController";
import { useAcpSession } from "./useAcpSession";
import { useDreamJob } from "./useDreamJob";
import { useGitWatcher } from "./useGitWatcher";
import { useGitActions } from "./useGitActions";
import { useToast } from "./useToast";
import { usePermissionQueue } from "./usePermissionQueue";
import { useCommandPalette } from "./useCommandPalette";
import { useSlashCommands } from "./useSlashCommands";
import { useWebuiPersist } from "./useWebuiPersist";
import type { AgentId } from "../lib/agent-id";
import { keepLiveModelOnCatalog, shouldWarmupOnChipSelect } from "../lib/session-agent";
import { readAgentModelSource } from "../lib/workbench-api";
import type { HubTab } from "../lib/commands";
import { useAppWorkspace, type AppConfirm } from "./useAppWorkspace";
import { useAppModelView } from "./useAppModelView";
import { handlePaletteAction } from "./app-model-palette";
import { useAppModelState } from "./useAppModelState";
import { useAppModelEffects } from "./useAppModelEffects";
import { packAppModel } from "./pack-app-model";

export type { AppConfirm };

export function useAppModel() {
  const s = useAppModelState();

  function setSelectedAgentIdPersist(id: AgentId) {
    s.agentPickedRef.current = true;
    s.selectedAgentIdLiveRef.current = id;
    s.setSelectedAgentId(id);
    s.persistRef.current({ lastAgent: id });
  }

  const notifyReviewOpened = useCallback(() => s.persistReviewOpened.current(), []);
  const toastApi = useToast();
  const { showToast } = toastApi;

  const dream = useDreamJob({
    enabled: s.dreamingEnabled,
    dreamAgentId: s.dreamAgentId,
    selectedAgentId: s.selectedAgentId,
    doctors: s.doctors,
    locale: s.locale,
    settingsHydrated: s.settingsHydrated,
    thresholdSessions: s.dreamThresholdSessions,
    showToast,
  });

  const acp = useAcpSession({
    cwd: s.cwd,
    inboxCwd: s.inboxCwd,
    projects: s.projects,
    lastWorkspace: s.lastWorkspace,
    mode: s.mode,
    model: s.model,
    selectedAgentId: s.selectedAgentId,
    setSelectedAgentId: setSelectedAgentIdPersist,
    sessionDrafts: s.sessionDrafts,
    titles: s.titles,
    extraPanes: s.extraPanes,
    persist: (partial) => s.persistRef.current(partial),
    showToast,
    locale: s.locale,
    setCwd: s.setCwd,
    setInboxCwd: s.setInboxCwd,
    setDraft: s.setDraft,
    setSettingsOpen: s.setSettingsOpen,
    setLastWorkspace: s.setLastWorkspace,
    setAtBottom: s.setAtBottom,
    setOpenProjects: s.setOpenProjects,
    setCollapsedIds: s.setCollapsedIds,
    setExpandedIds: s.setExpandedIds,
    setUnread: s.setUnread,
    setExtraPanes: s.setExtraPanes,
    onOpenSplit: () => s.setMenu(null),
    onSessionsNeedRefresh: (inbox) => s.refreshSessionsRef.current(inbox),
    onSessionCreated: (row) => s.onSessionCreatedRef.current(row),
    onAcpSessionList: (agentId, rows) => s.onAcpSessionListRef.current(agentId, rows),
    setSawExit: s.setSawExit,
    lastActivityRef: s.lastActivityRef,
    steerByDefault: s.steerByDefault,
    setSessionDrafts: s.setSessionDrafts,
    queueRef: s.queueRef,
    sessionQueuesRef: s.sessionQueuesRef,
    setQueue: s.setQueue,
    onLocalSlash: (cmd, rest, dest) => s.runSlashRef.current(cmd, rest, dest),
    onCancelPermission: (target) => s.permissionCancelRef.current(target),
    abortTurnIdle: (paneId) => {
      if (paneId === "main") s.busyStartRef.current = null;
      else delete s.extraBusyStartRef.current[paneId];
    },
    injectUserMemory: s.injectUserMemory,
    userMd: dream.userMd,
    doctors: s.doctors,
    promptHistoryRef: s.promptHistoryRef,
  });

  const doctorsReady = s.doctors.length > 0;
  const sendBlocked = !!agentSendBlockReason(s.selectedAgentId, s.doctors);
  const allSessions = useMemo(() => {
    const base = [...s.inboxSessions, ...s.sessions];
    return sessionsWithLiveRoster(base, acp.chat.items, {
      agentId: s.selectedAgentId,
      parentSessionId: acp.sessionId,
      cwd: s.cwd || "",
      nowIso: new Date().toISOString(),
    });
  }, [s.inboxSessions, s.sessions, acp.chat.items, s.selectedAgentId, acp.sessionId, s.cwd]);
  s.allSessionsRef.current = allSessions;

  const focusedExtra = s.focusedPaneId !== MAIN_PANE ? s.extraPanes[s.focusedPaneId] : undefined;
  const reviewCwd = focusedExtra?.cwd || s.cwd;
  const reviewSessionId = focusedExtra?.sessionId ?? acp.sessionId;
  const extraBusy = Object.values(s.extraPanes).some((p) => p.busy);

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
    locale: s.locale,
  });

  const persist = useWebuiPersist({
    projects: s.projects,
    theme: s.theme,
    mode: s.mode,
    chatWidth: s.chatWidth,
    titles: s.titles,
    inboxCwd: s.inboxCwd,
    chatFontSize: s.chatFontSize,
    pinned: s.pinned,
    archived: s.archived,
    drafts: s.sessionDrafts,
    enterSends: s.enterSends,
    autoArchiveDays: s.autoArchiveDays,
    filePanelOpen: review.open,
    steerByDefault: s.steerByDefault,
    injectUserMemory: s.injectUserMemory,
    dreamingEnabled: s.dreamingEnabled,
    dreamAgentId: s.dreamAgentId,
    dreamThresholdSessions: s.dreamThresholdSessions,
    memoryMcpEnabled: s.memoryMcpEnabled,
    memoryDisplayName: s.memoryDisplayName,
    unread: s.unread,
    sidebarWidth: s.sidebarWidth,
    previewWidth: s.previewWidth,
    locale: s.locale,
    themeFamily: s.themeFamily,
    accentId: s.accentId,
    hideToTray: s.hideToTray,
    defaultRail: s.defaultRail,
    shortcuts: s.shortcuts,
    lastWorkspace: s.lastWorkspace,
    pinnedProjects: s.pinnedProjects,
    projectGroups: s.projectGroups,
    sessionTokens: s.sessionTokens,
    sidebarList: s.sidebarList,
    lastAgent: s.selectedAgentId,
    manualProjects: s.manualProjects,
    sounds: s.sounds,
    allowedTools: [...s.allowedTools],
  });
  s.persistRef.current = persist;
  s.persistReviewOpened.current = () => persist(persistReviewOpen(true));

  const git = useGitWatcher({
    cwd: reviewCwd,
    onWorkspaceTouched: (dir) => {
      void listWorkspaceEntries(dir).then(s.setWorkspaceEntries).catch(() => {});
    },
  });
  const gitActions = useGitActions({ cwd: reviewCwd, git: git.git, showToast, refreshGit: git.refresh, locale: s.locale });

  const extraPaneList = Object.entries(s.extraPanes).map(([id, pane]) => ({
    id,
    sessionId: pane.sessionId,
    busy: pane.busy,
  }));
  const { permissions, answerPermission, cancelPermission } = usePermissionQueue({
    allowedTools: s.allowedTools,
    yolo: s.mode === "yolo",
    sessionId: acp.sessionId,
    runningSessionId: acp.runningSessionId,
    splitId: extraPaneList[0]?.sessionId ?? null,
    busy: acp.busy,
    splitBusy: extraBusy,
    extraPanes: extraPaneList,
    focusedPaneRef: s.focusedPermissionPaneRef,
    focusedRef: s.focusedRef,
    focusedSessionIdRef: s.focusedSessionIdRef,
    currentTitleRef: s.currentTitleRef,
    titleForSessionRef: s.titleForSessionRef,
    soundsRef: s.soundsRef,
    cwdForSession: (sid) => {
      if (sid && sid === acp.sessionId) return s.cwd;
      for (const pane of Object.values(s.extraPanes)) {
        if (pane.sessionId === sid) return pane.cwd;
      }
      return s.cwd;
    },
    telemetry: !!s.cli?.telemetry,
    onTimeoutNotice: () => showToast(permissionTimeoutNotice()),
  });

  const refreshInspect = useCallback(async (dir = s.cwd) => {
    try {
      const raw = await inspectBrief(dir || null);
      s.setInspect(parseInspect(raw));
    } catch {
      /* inspect is best-effort */
    }
  }, [s.cwd]);

  const refreshModels = useCallback(async (agentId?: AgentId) => {
    const id = agentId ?? s.selectedAgentIdLiveRef.current;
    try {
      const source = await readAgentModelSource(id);
      if (s.selectedAgentIdLiveRef.current !== id) return;
      const catalog = catalogFromSource(source);
      s.setModelRows(catalog.models);
      const nextModel = keepLiveModelOnCatalog(
        s.modelPickedRef.current,
        catalog.currentModel,
        s.modelLiveRef.current,
      );
      if (nextModel) s.setModel(nextModel);
      s.setEffort(catalog.currentEffort);
      s.setEffortReady(effortsForModel(catalog.models, nextModel || catalog.currentModel).length > 0);
    } catch {
      if (s.selectedAgentIdLiveRef.current !== id) return;
      const fallback = emptyCatalog(id);
      s.setModelRows(fallback.models);
      const nextModel = keepLiveModelOnCatalog(
        s.modelPickedRef.current,
        fallback.currentModel,
        s.modelLiveRef.current,
      );
      if (nextModel) s.setModel(nextModel);
      s.setEffort(fallback.currentEffort);
      s.setEffortReady(effortsForModel(fallback.models, nextModel || fallback.currentModel).length > 0);
    }
  }, []);

  useEffect(() => {
    s.modelPickedRef.current = false;
    const fallback = emptyCatalog(s.selectedAgentId);
    s.setModelRows(fallback.models);
    if (fallback.currentModel) s.setModel(fallback.currentModel);
    s.setEffort(fallback.currentEffort);
    s.setEffortReady(effortsForModel(fallback.models, fallback.currentModel).length > 0);
    void refreshModels(s.selectedAgentId);
  }, [s.selectedAgentId, refreshModels]);

  function openHub(tab: HubTab = "skills") {
    s.setHubTab(tab);
    s.setHubOpen(true);
    s.setSettingsOpen(false);
  }

  function openReview(action: Parameters<typeof review.openReview>[0]) {
    review.openReview(action);
    if (action === "changed-file") void git.refresh();
  }

  const ws = useAppWorkspace({
    locale: s.locale,
    cwd: s.cwd,
    inboxCwd: s.inboxCwd,
    projects: s.projects,
    sessions: s.sessions,
    inboxSessions: s.inboxSessions,
    titles: s.titles,
    projectGroups: s.projectGroups,
    chat: acp.chat,
    draft: s.draft,
    busy: acp.busy,
    atBottom: s.atBottom,
    picking: s.picking,
    editingTitleId: s.editingTitleId,
    sessionId: acp.sessionId,
    worktreeBusy: s.worktreeBusy,
    git: git.git,
    info: s.info,
    persist,
    showToast,
    setCwd: s.setCwd,
    setLastWorkspace: s.setLastWorkspace,
    setOpenProjects: s.setOpenProjects,
    setProjects: s.setProjects,
    setPicking: s.setPicking,
    setInboxSessions: s.setInboxSessions,
    setSessions: s.setSessions,
    setChat: acp.setChat,
    setDraft: s.setDraft,
    setAtBottom: s.setAtBottom,
    setQueue: s.setQueue,
    setTitles: s.setTitles,
    setProjectGroups: s.setProjectGroups,
    setOpenGroups: s.setOpenGroups,
    setEditingTitleId: s.setEditingTitleId,
    setTitleDraft: s.setTitleDraft,
    setMenu: s.setMenu,
    setMovePick: s.setMovePick,
    setAppConfirm: s.setAppConfirm,
    setWorktreeBusy: s.setWorktreeBusy,
    setFocusedPaneId: s.setFocusedPaneId,
    setPaneTree: s.setPaneTree,
    setExtraPanes: s.setExtraPanes,
    setPaneDrag: s.setPaneDrag,
    setExpandedIds: s.setExpandedIds,
    setCollapsedIds: s.setCollapsedIds,
    adoptSession: acp.adoptSession,
    cancelTurn: acp.cancelTurn,
    resumeSession: acp.resumeSession,
    startSession: acp.startSession,
    startNewChat: acp.startNewChat,
    startNewInPane: acp.startNewInPane,
    openInPane: acp.openInPane,
    bindMainAgent: acp.bindMainAgent,
    setSelectedAgentIdPersist,
    refreshGit: git.refresh,
    projectsRef: s.projectsRef,
    acpListedRef: s.acpListedRef,
    diskSessionsRef: s.diskSessionsRef,
    allSessionsRef: s.allSessionsRef,
    sessionIdRef: acp.sessionIdRef,
    runningSessionIdRef: acp.runningSessionIdRef,
    extraPanesRef: s.extraPanesRef,
    paneTreeRef: s.paneTreeRef,
    focusedPaneIdRef: s.focusedPaneIdRef,
    queueRef: s.queueRef,
    sessionQueuesRef: s.sessionQueuesRef,
    composerRef: s.composerRef,
    extraComposerRefs: s.extraComposerRefs,
    focusedPermissionPaneRef: s.focusedPermissionPaneRef,
    workColRef: s.workColRef,
    mainAgentIdRef: acp.mainAgentIdRef,
    selectedAgentId: s.selectedAgentId,
  });

  const subagentCards = useMemo(
    () =>
      subagentChips(acp.chat.items, allSessions, {
        parentSessionId: acp.sessionId,
        agentId: s.selectedAgentId,
      }),
    [acp.chat.items, allSessions, acp.sessionId, s.selectedAgentId],
  );

  const awaitingId = permissions[0] ? permissions[0].sessionId || acp.runningSessionId || acp.sessionId : null;
  const view = useAppModelView({
    locale: s.locale,
    busy: acp.busy,
    runningSessionId: acp.runningSessionId,
    liveTurnIds: acp.liveTurnIds,
    extraPanes: s.extraPanes,
    allSessions,
    awaitingId,
    unread: s.unread,
    projects: s.projects,
    inboxCwd: s.inboxCwd,
    pinned: s.pinned,
    pinnedProjects: s.pinnedProjects,
    archived: s.archived,
    autoArchiveDays: s.autoArchiveDays,
    sidebarList: s.sidebarList,
    titles: s.titles,
    sessionTokens: s.sessionTokens,
    clock: s.clock,
    chat: acp.chat,
    rewindTarget: s.rewindTarget,
    sessionId: acp.sessionId,
    selectedAgentId: s.selectedAgentId,
    mode: s.mode,
    cwd: s.cwd,
    modelRows: s.modelRows,
    model: s.model,
    permissions,
    extraPaneList,
    extraBusy,
    connecting: acp.connecting,
    ready: acp.ready,
    sawExit: s.sawExit,
    inspect: s.inspect,
    lastActivityAt: s.lastActivityRef.current,
    focusedExtra,
    planFile: s.planFile,
    rules: s.rules,
    detailsTool: review.detailsTool,
    previewPath: review.preview.path ?? "",
    changes: git.changes,
    reviewTab: review.tab,
    defaultRail: s.defaultRail,
    goalView: s.goalView,
    dismissedRecap: s.dismissedRecap,
    liveBindings: ws.liveBindings,
    focusedPaneId: s.focusedPaneId,
    paneTree: s.paneTree,
    subagentCards,
    current: ws.currentSession(),
    projectGroups: s.projectGroups,
  });

  const slash = useSlashCommands({
    cwd: s.cwd,
    inboxCwd: s.inboxCwd,
    model: s.model,
    effort: s.effort,
    sessionModel: view.sessionModel,
    titles: s.titles,
    chat: acp.chat,
    sessions: s.sessions,
    sessionId: acp.sessionId,
    extraPanes: Object.fromEntries(
      Object.entries(s.extraPanes).map(([id, pane]) => [id, { sessionId: pane.sessionId, busy: pane.busy, draft: pane.draft }]),
    ),
    mainPaneBusy: view.mainPaneBusy,
    loadingSession: acp.loadingSession,
    readyRef: acp.readyRef,
    sessionIdRef: acp.sessionIdRef,
    currentTitleRef: s.currentTitleRef,
    composerRef: s.composerRef,
    extraComposerRefs: s.extraComposerRefs,
    rewindLastEdit: view.rewindIndex.lastEdit,
    cli: s.cli,
    locale: s.locale,
    selectedAgentId: s.selectedAgentId,
    modelRows: s.modelRows,
    persist,
    showToast,
    setMode: s.setMode,
    setPendingMode: s.setPendingMode,
    setModel: s.setModel,
    modelPickedRef: s.modelPickedRef,
    setEffort: s.setEffort,
    setCli: s.setCli,
    setBusy: acp.setBusy,
    setExtraPanes: s.setExtraPanes,
    setDraft: s.setDraft,
    setExtraPage: s.setExtraPage,
    setImagineImages: s.setImagineImages,
    setImagineVideos: s.setImagineVideos,
    setAgentRows: s.setAgentRows,
    setTitles: s.setTitles,
    setRewindTarget: s.setRewindTarget,
    sendSlashToAgent: acp.sendSlashToAgent,
    sendPrompt: acp.sendPrompt,
    startSession: acp.startSession,
    openSettings: () => s.setSettingsOpen(true),
    openHub,
    removeSession: ws.removeSession,
    restoreGenerated: ws.restoreGenerated,
    beginEditTitle: ws.beginEditTitle,
    onDreamNow: dream.onDreamNow,
  });

  useEffect(() => {
    if (acp.busy) return;
    const pending = s.pendingModeRef.current;
    if (!pending) return;
    s.setPendingMode(null);
    void slash.applyMode(pending);
  }, [acp.busy]);

  const palette = useCommandPalette({
    sources: {
      sessions: allSessions,
      projects: s.projects,
      commands: acp.chat.commands,
      titles: s.titles,
      cwd: s.cwd,
      isRepo: !!git.git?.isRepo,
    },
    onAction: (action) =>
      handlePaletteAction(
        {
          locale: s.locale,
          theme: s.theme,
          reviewOpen: review.open,
          defaultRail: s.defaultRail,
          cwd: s.cwd,
          chat: acp.chat,
          allSessions,
          persist,
          showToast,
          setTheme: s.setTheme,
          setExtraPage: s.setExtraPage,
          setImagineImages: s.setImagineImages,
          setImagineVideos: s.setImagineVideos,
          setAgentRows: s.setAgentRows,
          composerSetText: (text) => s.composerRef.current?.setText(text),
          openSession: ws.openSession,
          selectProject: ws.selectProject,
          runSlash: slash.runSlash,
          newChatInFocus: ws.newChatInFocus,
          startSession: acp.startSession,
          openSettings: () => s.setSettingsOpen(true),
          openHub,
          sendPrompt: acp.sendPrompt,
          toggleReview: (tab) => review.toggle(tab),
          openReview,
          addProject: ws.addProject,
          newWorktreeSession: ws.newWorktreeSession,
          openPath,
          listImagineArtifacts,
          listAgentsDir,
        },
        action,
      ),
  });

  useAppModelEffects({
    s,
    ws,
    acp,
    view,
    review,
    persist,
    showToast,
    palette,
    extraBusy,
    mainPaneBusy: view.mainPaneBusy,
    cancelPermission,
    refreshInspect,
    refreshGit: git.refresh,
    sendPrompt: acp.sendPrompt,
    doctorsReady,
    sendBlocked,
    runSlash: slash.runSlash,
    locale: s.locale,
    allSessions,
    reviewCwd,
    reviewSessionId,
    focusedExtra,
  });

  const rewindForItem = useCallback(
    (itemId: string): (() => void) | undefined => {
      const index = view.rewindIndex.byId.get(itemId);
      if (index === undefined || index > view.rewindIndex.lastEdit) return undefined;
      return () => s.setRewindTarget(index);
    },
    [view.rewindIndex],
  );

  return packAppModel({
    s,
    ws,
    view,
    acp,
    dream,
    review,
    palette,
    git,
    gitActions,
    toast: toastApi,
    slash,
    persist,
    reviewCwd,
    allSessions,
    answerPermission,
    cancelPermission,
    refreshInspect,
    openHub,
    openReview,
    rewindForItem,
    dismissRecap: () => s.setDismissedRecap(view.recapKey),
    setSelectedAgentId: (id: AgentId) => {
      setSelectedAgentIdPersist(id);
      void (async () => {
        let rows = s.doctorsRef.current;
        try {
          rows = await doctorAll();
          s.setDoctors(rows);
        } catch {
          /* keep last snapshot if the probe fails */
        }
        const blocked = blockedAgentToast(id, rows);
        if (blocked) {
          showToast(blocked);
          return;
        }
        if (shouldWarmupOnChipSelect()) await acp.ensureAgent(id);
      })().catch((e) => showToast(friendlyError(e)));
    },
  });
}
