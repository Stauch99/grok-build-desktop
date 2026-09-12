import { useEffect, useMemo, useRef, useState } from "react";
import {
  doctor,
  listProjectFiles,
  openInTerminal,
  openPath,
  searchSessionText,
  setWorkspace,
  writeAllowedText,
  trustFolder,
  runGrokStream,
  beginWindowDrag,
} from "./api";
import { sameCwd } from "./lib/inbox";
import { agentChipLabel, connectingBannerText, restartAgentBannerText } from "./lib/agent-chip";
import { isAgentId } from "./lib/agent-id";
import { t } from "./lib/i18n";
import { LocaleProvider } from "./lib/locale-context";
import { normalizeChatFontSize } from "./lib/chat-font";
import { chatWidthCss } from "./lib/chat-width";
import { permissionTimeoutNotice } from "./lib/permission-copy";
import { editQueued, removeQueued, reorderQueue } from "./lib/prompt-queue";
import { maxFor, PREVIEW, SIDEBAR } from "./lib/layout";
import { paneComposerTakeover } from "./lib/shell-ia";
import { forkAtSlash } from "./lib/turn-files";
import { RecapCard } from "./components/RecapCard";
import { GoalBar } from "./components/GoalBar";
import { ComposerDock } from "./components/ComposerDock";
import { StatsLineView } from "./components/StatsLineView";
import { MillerPicker } from "./components/MillerPicker";
import { Resizer } from "./components/Resizer";
import { persistReviewOpen } from "./lib/review-rail";
import { usePresence } from "./lib/motion";
import { useSidebarMotion, sidebarSlotPx } from "./lib/sidebar-motion";
import { markScrolling, scheduleFrameValue } from "./lib/scroll-frame";
import { displayTitle } from "./lib/projects";
import { MAIN_PANE } from "./lib/pane-tree";
import { selectPaneMentionSource } from "./lib/pane-mentions";
import { derivePermissionView } from "./lib/permission-view";
import { turnStatsFromItems } from "./lib/usage-split";
import { PaneLayout } from "./components/PaneLayout";
import { PaneDropOverlay } from "./components/PaneDropOverlay";
import { isArchived, isPinned, toggleId } from "./lib/session-chrome";
import { INBOX_PIN } from "./lib/sidebar-list";
import { allowForGrant, allowForSession, findAlwaysOption, isHighRiskTool, parseToolName, pickAllowOption } from "./lib/permission-allow";
import type { QueuedPermission } from "./lib/permission-queue";
import { subagentChips } from "./lib/subagent-tree";
import { friendlyError } from "./lib/error-copy";
import { JobsMenu } from "./components/JobsMenu";
import { WorkPane } from "./components/WorkPane";
import { SessionMenu } from "./SessionMenu";
import { SettingsPanel } from "./Settings";
import { ExtensionsHub } from "./components/ExtensionsHub";
import { Sidebar } from "./components/Sidebar";
import { PendingRequestCard } from "./components/PendingRequestCard";
import { FilePanel } from "./components/FilePanel";
import { PreviewPane } from "./components/PreviewPane";
import { ReviewRail } from "./components/ReviewRail";
import { ExplorerPane } from "./components/ExplorerPane";
import { BashCommandRow } from "./components/BashCommandRow";
import { RunStatusRegion } from "./components/RunStatusRegion";
import { MemoryInjectChip } from "./components/MemoryInjectChip";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChatPane } from "./components/ChatPane";
import { handleMdClick } from "./components/Thread";
import { UsageRing } from "./components/UsageRing";
import { GitChip } from "./components/GitBar";
import { GitPane } from "./components/GitPane";
import { PlanCompleteCard } from "./components/PlanCompleteCard";
import { ExtraOverlay } from "./components/ExtraOverlay";
import { MenuSelect } from "./components/MenuSelect";
import { Composer } from "./components/Composer";
import { SelectionActions } from "./components/SelectionActions";
import { CommandPalette } from "./components/CommandPalette";
import { EmptyState } from "./components/EmptyState";
import { Skeleton } from "./components/Skeleton";
import { AppModal } from "./components/AppModal";
import { RewindDialog } from "./components/RewindDialog";
import { basename } from "./lib/text";
import { IconGrokClose, IconGrokCopy, IconGrokMore, IconGrokSidebar } from "./grok-icons";
import { IconGitFork, IconHierarchy2 } from "./icons";
import { TodoMark } from "./components/TodoMark";
import { ShortcutKbd, ShortcutProvider } from "./components/ShortcutHint";
import { useAppModel } from "./hooks/useAppModel";

export function App() {
  const {
    theme,
    setTheme,
    resolvedTheme,
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
    accentId,
    setAccentId,
    hideToTray,
    setHideToTray,
    defaultRail,
    setDefaultRail,
    shortcuts,
    setShortcuts,
    inspect,
    skillCommands,
    modelCatalog,
    effortOptions,
    modelLabels,
    extraPage,
    setExtraPage,
    imagineImages,
    imagineVideos,
    agentRows,
    managed,
    usageHistory,
    appConfirm,
    confirmAppModal,
    cancelAppModal,
    usageDays,
    setUsageDays,
    jumpTurnId,
    doctorNote,
    setDoctorNote,
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
    pauseToast,
    resumeToast,
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
    setLastWorkspace,
    sidebarList,
    setSidebarList,
    pinnedProjects,
    setPinnedProjects,
    projectGroups,
    openGroups,
    setOpenGroups,
    createNamedGroup,
    createGroupForProject,
    moveProjectToGroup,
    renameNamedGroup,
    requestDeleteGroup,
    settingsFocus,
    setSettingsFocus,
    expandedIds,
    collapsedIds,
    setCollapsedIds,
    setAllowedTools,
    workspaceEntries,
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
    injectedSessions,
    dismissInjectedSession,
    dreamDiary,
    dreamStatus,
    dreamCorpus,
    dreamUserMdPath,
    dreamDreamsMdPath,
    dreamTagline,
    onDreamNow,
    onFoundingNow,
    foundingAt,
    dreamProposals,
    onProposalApprove,
    onProposalDismiss,
    setInjectUserMemory,
    dreamingEnabled,
    setDreamingEnabled,
    dreamAgentId,
    setDreamAgentId,
    dreamThresholdSessions,
    setDreamThresholdSessions,
    memoryMcpEnabled,
    setMemoryMcpEnabled,
    memoryDisplayName,
    setMemoryDisplayName,
    doctors,
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
    setSelectedAgentId,
    sessionIdRef,
    chat,
    paneChatStore,
    ready,
    connecting,
    loadingSession,
    ensureAgent,
    startInboxSession,
    newChatInFocus,
    startSession,
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
    effortReady,
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
    sessionPreviews,
    sessionModel,
    recapText,
    showRecap,
    dismissRecap,
    copyAllConversation,
    cwdLocked,
    menuSession,
    findSessionById,
    usage,
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
    timedOutByPane,
    takeover,
    hero,
    turnFiles,
    terminalTools,
    reviewTabs,
    reconciledReviewTab,
    jobs,
    catalog,
    goalView,
    health,
    runStatus,
    mainWedged,
    turnStats,
    sounds,
    setSounds,
    pendingMode,
    promptHistoryRef,
    cancelPermission,
    allowedTools,
  } = useAppModel();
  const reviewPresence = usePresence(reviewOpen);
  const settingsPresence = usePresence(settingsOpen);
  const toastPresence = usePresence(!!toast);
  const palettePresence = usePresence(palette.open);
  const sidebarMotion = useSidebarMotion(sidebarCollapsed);
  const appRef = useRef<HTMLDivElement>(null);
  const toastHold = useRef(toast);
  if (toast) toastHold.current = toast;
  const setAtBottomFrame = useMemo(() => scheduleFrameValue(setAtBottom), [setAtBottom]);
  const [planMarkedComplete, setPlanMarkedComplete] = useState(false);
  useEffect(() => {
    setPlanMarkedComplete(false);
  }, [sessionId]);
  const showPlanComplete = planComplete || planMarkedComplete;

  function attachToSession(path: string, kind: "file" | "dir" = "file") {
    const handle = focusedPaneId === MAIN_PANE
      ? composerRef.current
      : extraComposerRefs.current[focusedPaneId];
    handle?.attachPaths([{ path, kind }]);
    handle?.focus();
  }

  function rememberGrant(perm: QueuedPermission, paneCwd: string, paneSid: string | null) {
    const tool = parseToolName(perm.title, perm.toolKind);
    let next = allowedTools;
    if (paneSid) next = allowForSession(next, paneSid, tool);
    if (!isHighRiskTool(tool)) next = allowForGrant(next, perm.agentId, paneCwd, tool);
    setAllowedTools(next);
    persist({ allowedTools: [...next] });
    const pick = (isHighRiskTool(tool) ? null : findAlwaysOption(perm.options)) ?? pickAllowOption(perm.options);
    if (pick) void answerPermission(perm, pick);
  }

  function inspectJob(job: { id: string; paneId: string }) {
    setJobsOpen(false);
    if (job.paneId !== focusedPaneId) focusPane(job.paneId);
    const items = job.paneId === MAIN_PANE
      ? paneChatStore.getMain().chat.items
      : paneChatStore.getExtra(job.paneId).chat.items;
    const item = items?.find((it) => it.kind === "tool" && it.id === job.id);
    if (item && item.kind === "tool") review.inspectTool(item);
  }

  function stopJob(job: { paneId: string }) {
    setJobsOpen(false);
    void cancelTurn(job.paneId);
  }

  function stopAndRetry(paneId: string) {
    const items =
      paneId === MAIN_PANE ? paneChatStore.getMain().chat.items : paneChatStore.getExtra(paneId).chat.items;
    let text = "";
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind === "user" && item.text.trim()) {
        text = item.text;
        break;
      }
    }
    void cancelTurn(paneId).then(() => {
      if (!text) return;
      if (paneId === MAIN_PANE) onDraftChange(text);
      else onExtraDraftChange(paneId, text);
      showToast(t(locale, "toast.wedgedRetry"));
    });
  }

  function jobsMenu() {
    const sessionHint: Record<string, string> = {};
    for (const job of jobs) {
      if (!job.sessionId || job.sessionId in sessionHint) continue;
      const s = findSessionById(job.sessionId);
      if (s) sessionHint[job.sessionId] = displayTitle(s, titles, sessionPreviews);
    }
    return (
      <JobsMenu
        jobs={jobs}
        open={jobsOpen}
        onToggle={() => setJobsOpen((o) => !o)}
        onClose={() => setJobsOpen(false)}
        sessionHint={sessionHint}
        currentSessionId={sessionId}
        onInspect={inspectJob}
        onStop={stopJob}
      />
    );
  }

  function copyConversationBtn(pane: string) {
    return (
      <button
        type="button"
        className="icon-btn"
        aria-label={t(locale, "thread.copyAll")}
        onClick={() => {
          const items = pane === MAIN_PANE ? paneChatStore.getMain().chat.items : paneChatStore.getExtra(pane).chat.items;
          copyAllConversation(items);
        }}
      >
        <IconGrokCopy size={16} />
      </button>
    );
  }

  const reviewItems =
    focusedPaneId === MAIN_PANE
      ? chat.items
      : extraPanes[focusedPaneId]?.chat.items ?? chat.items;

  function customAnswerFor(perm: QueuedPermission, paneId: string) {
    return (text: string) => {
      void cancelPermission(perm);
      if (paneId === MAIN_PANE) onDraftChange(text);
      else onExtraDraftChange(paneId, text);
    };
  }

  function requestCards(
    paneId: string,
    perm: QueuedPermission | null,
    kind: "permission" | "question" | null,
    paneCwd: string,
    paneSid: string | null,
    visible: boolean,
  ) {
    const timedOut = timedOutByPane[paneId] ?? [];
    return (
      <>
        {timedOut.map((item) => (
          <PendingRequestCard
            key={`to-${String(item.rpcId)}`}
            kind="permission"
            title={item.title}
            options={item.options}
            timedOut
            receivedAt={item.receivedAt}
            onPick={(id) => void answerPermission(item, id)}
            onAlwaysAllow={() => rememberGrant(item, paneCwd, paneSid)}
            canRemember={!isHighRiskTool(parseToolName(item.title, item.toolKind))}
          />
        ))}
        {perm && kind && visible && (
          <PendingRequestCard
            kind={kind}
            title={perm.title}
            options={perm.options}
            timedOut={perm.timedOut}
            timeoutNotice={permissionTimeoutNotice(locale)}
            receivedAt={perm.receivedAt}
            onPick={(id) => void answerPermission(perm, id)}
            onAlwaysAllow={kind === "permission" ? () => rememberGrant(perm, paneCwd, paneSid) : undefined}
            onCustomAnswer={kind === "question" ? customAnswerFor(perm, paneId) : undefined}
            canRemember={!isHighRiskTool(parseToolName(perm.title, perm.toolKind))}
          />
        )}
      </>
    );
  }

  function renderSplitLeaf(paneId: string) {
    const extra = paneId === MAIN_PANE ? null : extraPanes[paneId];
    const sid = extra?.sessionId ?? sessionId;
    const paneCwd = extra?.cwd ?? cwd;
    const paneChat = extra?.chat ?? chat;
    const paneDraft = extra?.draft ?? draft;
    const paneBusy = extra ? extra.busy : mainPaneBusy;
    const paneQueue = extra?.queue ?? queue;
    const paneAtBottom = extra ? extra.atBottom : atBottom;
    const paneSession = sid
      ? sessions.find((s) => s.id === sid) ?? inboxSessions.find((s) => s.id === sid) ?? null
      : paneId === MAIN_PANE ? current : null;
    const paneTitle = paneSession ? displayTitle(paneSession, titles, sessionPreviews) : t(locale, "chrome.newSession");
    const mentions = extra
      ? selectPaneMentionSource(extra.cwd, extraMentionData[paneId] ?? null)
      : { dirs: workspaceEntries.filter((e) => e.kind === "dir").map((e) => e.name), changes: changes.map((c) => c.path) };
    const perm = panePermissions[paneId] ?? null;
    const permView = derivePermissionView({
      request: perm,
      mainSessionId: sessionId,
      runningMainSessionId: sessionId,
      splitSessionId: extra?.sessionId ?? null,
      mainBusy: mainPaneBusy,
      splitBusy: extra?.busy ?? false,
      extraPanes: Object.entries(extraPanes).map(([id, pane]) => ({ id, sessionId: pane.sessionId, busy: pane.busy })),
    });
    const paneTakeover = paneComposerTakeover({
      pane: paneId,
      pendingPane: permView.pane,
      pendingKind: permView.kind,
      plan: paneId === MAIN_PANE && showPlanComplete,
    });
    const paneCatalog = subagentChips(paneChat.items, allSessions, {
      parentSessionId: sid,
      agentId: extra?.agentId ?? selectedAgentId,
    });
    const paneStats = turnStatsFromItems(paneChat.items, paneChat.usage?.output, {
      now: Date.now(),
      live: paneBusy,
    });
    const paneChatRef = paneId === MAIN_PANE
      ? chatEl
      : {
          get current() {
            return extraChatEls.current[paneId] ?? null;
          },
          set current(el: HTMLDivElement | null) {
            extraChatEls.current[paneId] = el;
          },
        };
    const panePlanComplete =
      (mode === "plan" &&
        paneChat.plan.length > 0 &&
        paneChat.plan.every((e) => e.status === "completed")) ||
      (paneId === MAIN_PANE && planMarkedComplete);
    return (
      <ErrorBoundary locale={locale}>
      <WorkPane
        paneId={paneId}
        focused={focusedPaneId === paneId}
        onFocus={() => {
          focusedPermissionPaneRef.current = paneId;
          focusPane(paneId);
        }}
      >
        <header
          className="workspace-head"
          onPointerDown={(e) => {
            if (!paneSession) return;
            if ((e.target as HTMLElement).closest("button, input, [data-menu-trigger], .workspace-head-drag")) return;
            beginPaneDrag(e, paneSession);
          }}
        >
          <div className="title-wrap">
            <span className="crumb-cwd">
              {inboxCwd && paneCwd && sameCwd(paneCwd, inboxCwd) ? t(locale, "cwd.none") : basename(paneCwd || "")}
            </span>
            <span className="crumb-sep">/</span>
            {editingTitleId && sid && editingTitleId === sid ? (
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
                  if (titleDraft.trim() && titleDraft.trim() !== paneTitle) commitTitle(titleDraft);
                  else cancelEditTitle();
                }}
              />
            ) : sid ? (
              <>
                <button type="button" className="session-title-btn" onClick={() => beginEditTitle(sid)}>
                  {paneTitle}
                </button>
                <button type="button" className="icon-btn" data-menu-trigger aria-label={t(locale, "session.actions")} onClick={(e) => openMenu("header", sid, e.currentTarget)}>
                  <IconGrokMore size={18} />
                </button>
              </>
            ) : (
              <span className="title-static">{t(locale, "chrome.newSession")}</span>
            )}
            <div
              className="workspace-head-drag"
              data-tauri-drag-region
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                beginWindowDrag();
              }}
            />
          </div>
          <div className="head-actions">
            {git?.isRepo ? (
              <GitChip status={git} onClick={() => openReview("changed-file")} />
            ) : null}
            {jobsMenu()}
            {paneCatalog.length > 0 && (
              <div className="chip-wrap">
                <button
                  type="button"
                  className="icon-btn head-count-btn"
                  aria-expanded={catalogOpen}
                  aria-label={t(locale, "subagent.count", { n: paneCatalog.length })}
                  onClick={() => setCatalogOpen((o) => !o)}
                >
                  <IconHierarchy2 size={16} />
                  <span className="head-count">{paneCatalog.length}</span>
                </button>
                {catalogOpen ? (
                  <div className="chip-menu" role="menu">
                    {paneCatalog.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setCatalogOpen(false);
                          if (!s.sessionId) return;
                          const sess = findSessionById(s.sessionId);
                          if (sess) void openSession(sess);
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {sid ? copyConversationBtn(paneId) : null}
            <button
              type="button"
              className="icon-btn shortcut-host"
              aria-label={t(locale, "rail.dashboard")}
              aria-expanded={reviewOpen}
              onClick={() => {
                const next = !reviewOpen;
                review.toggle(defaultRail);
                persist(persistReviewOpen(next));
              }}
            >
              <IconGrokSidebar size={18} mirror />
              <ShortcutKbd id="review" />
            </button>
            {paneCount > 1 ? (
              <button type="button" className="icon-btn" aria-label={t(locale, "pane.close")} onClick={() => closePaneLeaf(paneId)}>
                <IconGrokClose size={16} />
              </button>
            ) : null}
          </div>
        </header>
        <div className="chat-shell">
          <ChatPane
            store={paneChatStore}
            paneId={paneId}
            chatWidth={chatWidth}
            dark={resolvedTheme === "dark"}
            cwd={paneCwd}
            showThinking={showThinking}
            emptyTitle=""
            sessionModel={paneSession?.model ?? null}
            stallNote={paneId === MAIN_PANE && runStatus.kind === "stalled" ? runStatus.detail : undefined}
            onCancel={() => void cancelTurn(paneId)}
            onStopAndRetry={paneId === MAIN_PANE && mainWedged ? () => stopAndRetry(paneId) : undefined}
            chatRef={paneChatRef}
            pinToLatest={paneAtBottom}
            sessionId={sid}
            loading={paneId === MAIN_PANE ? loadingSession : false}
            onScroll={(el) => {
              markScrolling(el);
              const at = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (paneId === MAIN_PANE) setAtBottomFrame(at);
              else onExtraAtBottom(paneId, at);
            }}
            onResendUser={(text) => submitPrompt(text, paneId)}
            rewindFor={rewindForItem}
            onForkTurn={() => void sendPrompt(forkAtSlash(), paneId)}
            onInspectTool={review.inspectTool}
            onPreviewPath={(p) => void openPreview(p)}
            highlightQuery={searchJump}
            jumpId={jumpTurnId}
            onDraftUser={(text) => (paneId === MAIN_PANE ? onDraftChange(text) : onExtraDraftChange(paneId, text))}
            atBottom={paneAtBottom}
            onJumpBottom={() => {
              if (paneId === MAIN_PANE) {
                setAtBottom(true);
                if (chatEl.current) chatEl.current.scrollTop = chatEl.current.scrollHeight;
              } else {
                onExtraAtBottom(paneId, true);
                const el = extraChatEls.current[paneId];
                if (el) el.scrollTop = el.scrollHeight;
              }
            }}
            emptyNode={
              <EmptyState
                  doctor={doctors.find((d) => d.agentId === selectedAgentId) ?? null}
                  agentLabel={agentChipLabel(selectedAgentId)}
                  cwd={paneCwd}
                  projectCount={projects.length}
                  onPickProject={() => void addProject()}
                  onInbox={() => void startInboxSession()}
                  onCopyLogin={(text) => {
                    void navigator.clipboard.writeText(text);
                    showToast(t(locale, "toast.copiedLogin"));
                  }}
                  onBrowseWorkspace={() => setMillerOpen(true)}
                  lastPrompt={promptHistoryRef.current.at(-1) ?? null}
                  onUseLastPrompt={(text) => (paneId === MAIN_PANE ? onDraftChange(text) : onExtraDraftChange(paneId, text))}
                  onUseExample={(text) => (paneId === MAIN_PANE ? onDraftChange(text) : onExtraDraftChange(paneId, text))}
                />
            }
          />
        </div>
        <Composer
          ref={(el) => {
            if (paneId === MAIN_PANE) composerRef.current = el;
            else extraComposerRefs.current[paneId] = el;
          }}
          value={paneDraft}
          onChange={(v) => (paneId === MAIN_PANE ? onDraftChange(v) : onExtraDraftChange(paneId, v))}
          onSend={(text) => submitPrompt(text, paneId)}
          onAlt={(text) => altSubmit(text, paneId)}
          altLabel={steerByDefault ? t(locale, "composer.queue") : t(locale, "composer.steer")}
          busy={paneBusy}
          takeover={paneTakeover}
          enterSends={enterSends}
          threadWidth={chatWidthCss(chatWidth)}
          commands={[...skillCommands, ...paneChat.commands]}
          onRunSlash={(cmd, rest) => void runSlash(cmd, rest, paneId)}
          cwd={paneCwd}
          grokHome={info?.grokHome ?? ""}
          listFiles={(q) => listProjectFiles(paneCwd, q)}
          mentionDirs={mentions.dirs}
          mentionChanges={mentions.changes}
          mode={mode}
          onMode={(m) => void applyMode(m, paneId)}
          effort={effort}
          onEffort={applyEffort}
          effortReady={effortReady}
          effortOptions={effortOptions}
          model={model}
          sessionModel={paneSession?.model ?? null}
          modelOptions={modelCatalog}
          modelLabels={modelLabels}
          onModel={applyModel}
          onSessionModel={applySessionModel}
          onOpenSettings={openSettings}
          selectedAgentId={selectedAgentId}
          onSelectedAgent={setSelectedAgentId}
          hasOpenSession={!!sessionId}
          queue={paneQueue}
          onRemoveQueued={(id) => {
            if (paneId === MAIN_PANE) setQueue((q) => removeQueued(q, id));
            else onExtraQueue(paneId, (q) => removeQueued(q, id));
          }}
          onReorderQueued={(from, to) => {
            if (paneId === MAIN_PANE) setQueue((q) => reorderQueue(q, from, to));
            else onExtraQueue(paneId, (q) => reorderQueue(q, from, to));
          }}
          onEditQueued={(id, text) => {
            if (paneId === MAIN_PANE) setQueue((q) => editQueued(q, id, text));
            else onExtraQueue(paneId, (q) => editQueued(q, id, text));
          }}
          onOverflow={showToast}
          footer={<StatsLineView stats={paneStats} sessionTokens={paneChat.usage?.used} usageHistory={usageHistory} />}
          metaActions={
            <UsageRing
              usage={paneChat.usage ?? {}}
              compactPercent={cli?.compactPercent ?? 85}
              onCompact={(pct) => {
                if (window.confirm(t(locale, "usage.compactAsk", { pct }))) void sendPrompt("/compact", paneId);
              }}
            />
          }
          pendingMode={pendingMode}
          promptHistoryRef={promptHistoryRef}
        >
          {requestCards(
            paneId,
            perm,
            permView.kind,
            paneCwd,
            sid,
            paneId === MAIN_PANE ? permView.mainVisible : permView.splitVisible,
          )}
          {panePlanComplete ? (
            <PlanCompleteCard
              onApprove={() => void applyMode("agent")}
              onReject={() => void sendPrompt(t(locale, "plan.rejectFeedback"), paneId)}
              onFeedback={(text) => void sendPrompt(text, paneId)}
            />
          ) : null}
          {mode === "plan" && !panePlanComplete ? (
            <button type="button" className="btn ghost" onClick={() => setPlanMarkedComplete(true)}>
              {t(locale, "plan.markComplete")}
            </button>
          ) : null}
        </Composer>
      </WorkPane>
      </ErrorBoundary>
    );
  }

return (
    <ShortcutProvider shortcuts={shortcuts}>
    <LocaleProvider locale={locale}>
    <div
      ref={appRef}
      className="app"
      lang={locale === "en" ? "en" : "zh-CN"}
      data-sidebar-motion={sidebarMotion.motion ? "" : undefined}
      style={{
        ["--md-size" as string]: `${normalizeChatFontSize(chatFontSize)}px`,
        ["--sidebar-w" as string]: `${sidebarSlotPx(sidebarMotion.slotCollapsed, sidebarWidth)}px`,
        ["--review-w" as string]: `${previewWidth}px`,
      }}
    >
      <Sidebar
        sections={sidebarSections}
        prefs={sidebarList}
        onPrefs={(next) => {
          setSidebarList(next);
          persist({ sidebarList: next });
        }}
        onSearch={() => palette.setOpen(true)}
        searchHits={searchHits}
        onOpenHit={(id) => {
          const s = findSessionById(id);
          if (s) void openSession(s);
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
        groups={projectGroups.groups}
        groupMembership={projectGroups.membership}
        openGroups={openGroups}
        onToggleGroup={(id) => setOpenGroups((m) => ({ ...m, [id]: m[id] === false }))}
        onCreateGroup={createNamedGroup}
        onCreateGroupForProject={createGroupForProject}
        onMoveProjectToGroup={moveProjectToGroup}
        onRenameGroup={renameNamedGroup}
        onDeleteGroup={requestDeleteGroup}
        sessionId={sessionId}
        openIds={openIds}
        focusedId={focusedSessionId}
        titles={titles}
        preview={sessionPreviews}
        expandedIds={expandedIds}
        collapsedIds={collapsedIds}
        onToggleExpand={toggleExpand}
        onOpenSession={(s) => void openSession(s)}
        onSessionMenu={(id, el, point) => openMenu("row", id, el, point)}
        onNewChat={() => void newChatInFocus()}
        onNewProjectSession={(path) => {
          const last = path === INBOX_PIN || (inboxCwd && sameCwd(path, inboxCwd)) ? INBOX_PIN : path;
          setLastWorkspace(last);
          persist({ lastWorkspace: last });
          setOpenProjects((m) => ({ ...m, [path]: true }));
          void startSession(path);
        }}
        onDragSession={beginPaneDrag}
        onAddProject={() => void addProject()}
        picking={picking}
        statusFor={statusFor}
        width={sidebarSlotPx(sidebarMotion.slotCollapsed, sidebarWidth)}
        collapsed={sidebarMotion.contentHidden}
        hiding={sidebarMotion.motion && sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        signedIn={!!info?.authPresent}
        weeklyUsage={weeklyUsage}
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
          setOpenGroups((m) => {
            const next: Record<string, boolean> = {};
            for (const key of Object.keys(m)) next[key] = false;
            for (const group of projectGroups.groups) next[group.id] = false;
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
      {!sidebarMotion.slotCollapsed && (
      <Resizer
        ariaLabel={t(locale, "sidebar.resize")}
        className="sidebar-resizer"
        value={sidebarWidth}
        min={SIDEBAR.min}
        max={maxFor(SIDEBAR, winWidth, reviewOpen ? previewWidth : 0)}
        resetTo={SIDEBAR.initial}
        onChange={(n) => {
          appRef.current?.style.setProperty("--sidebar-w", `${n}px`);
        }}
        onCommit={(n) => {
          setSidebarWidth(n);
          persist({ sidebarWidth: n });
        }}
      />
      )}

      <div className="workspace-stage">
      <main className={`workspace${paneCount > 1 ? " split" : ""}${!sessionId || hero.hero ? " new-chat-hero" : ""}`}>
        {health === "disconnected" && (
          <div className="trust-banner" role="alert">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void ensureAgent().catch((e) => showToast(friendlyError(e)));
              }}
            >
              {restartAgentBannerText(selectedAgentId)}
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
          <div className="trust-banner" role="status">{connectingBannerText(selectedAgentId)}</div>
        )}
        {inspect && cwd && inspect.projectTrusted === false && (
          <div className="trust-banner" role="status">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void trustFolder(cwd, true).then(() => {
                  void refreshInspect();
                  showToast(t(locale, "trust.done"));
                });
              }}
            >
              {t(locale, "trust.action")}
            </button>
          </div>
        )}
        {paneCount === 1 ? (
        <ErrorBoundary locale={locale}>
        <WorkPane paneId={MAIN_PANE} focused className="solo" onFocus={() => focusPane(MAIN_PANE)}>
          <div className="pane-body">
          <div className="work-col" ref={workColRef}>
          <header className="workspace-head">
            <div className="title-wrap">
              <MenuSelect
                variant="inline"
                className="crumb-cwd"
                ariaLabel={t(locale, "cwd.pick")}
                disabled={cwdLocked}
                value={cwd || inboxCwd}
                options={[
                  ...(inboxCwd ? [{ value: inboxCwd, label: t(locale, "cwd.none") }] : []),
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
                    onClick={() => beginEditTitle(sessionId)}
                  >
                    {currentTitle}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-menu-trigger
                    aria-label={t(locale, "session.actions")}
                    onClick={(e) => openMenu("header", sessionId, e.currentTarget)}
                  >
                    <IconGrokMore size={18} />
                  </button>
                </>
              ) : (
                <span className="title-static">{t(locale, "chrome.newSession")}</span>
              )}
              <div
                className="workspace-head-drag"
                data-tauri-drag-region
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  beginWindowDrag();
                }}
              />
            </div>
            <div className="head-actions">
              {git?.isRepo ? (
                <GitChip status={git} onClick={() => openReview("changed-file")} />
              ) : null}
              {jobsMenu()}
              {catalog.length > 0 && (
                <div className="chip-wrap">
                  <button
                    type="button"
                    className="icon-btn head-count-btn"
                    aria-expanded={catalogOpen}
                    aria-label={t(locale, "subagent.count", { n: catalog.length })}
                    onClick={() => setCatalogOpen((o) => !o)}
                  >
                    <IconHierarchy2 size={16} />
                    <span className="head-count">{catalog.length}</span>
                  </button>
                  {catalogOpen ? (
                    <div className="chip-menu" role="menu">
                      {catalog.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setCatalogOpen(false);
                            if (!s.sessionId) return;
                            const sess = findSessionById(s.sessionId);
                            if (sess) void openSession(sess);
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {sessionId ? copyConversationBtn(MAIN_PANE) : null}
              {(
                <button
                  type="button"
                  className="icon-btn shortcut-host"
                  aria-label={t(locale, "rail.dashboard")}
                  aria-expanded={reviewOpen}
                  onClick={() => {
                    const next = !reviewOpen;
                    review.toggle(defaultRail);
                    persist(persistReviewOpen(next));
                  }}
                >
                  <IconGrokSidebar size={18} mirror />
                  <ShortcutKbd id="review" />
                </button>
              )}
            </div>
          </header>
          <div className="chat-shell">
            <ChatPane
              store={paneChatStore}
              paneId="main"
              chatWidth={chatWidth}
              dark={resolvedTheme === "dark"}
              cwd={cwd}
              showThinking={showThinking}
              emptyTitle=""
              emptyNode={
                <EmptyState
                  doctor={doctors.find((d) => d.agentId === selectedAgentId) ?? null}
                  agentLabel={agentChipLabel(selectedAgentId)}
                  cwd={cwd}
                  projectCount={projects.length}
                  onPickProject={() => void addProject()}
                  onInbox={() => void startInboxSession()}
                  onCopyLogin={(text) => {
                    void navigator.clipboard.writeText(text);
                    showToast(t(locale, "toast.copiedLogin"));
                  }}
                  onBrowseWorkspace={() => setMillerOpen(true)}
                  lastPrompt={promptHistoryRef.current.at(-1) ?? null}
                  onUseLastPrompt={(text) => onDraftChange(text)}
                  onUseExample={(text) => onDraftChange(text)}
                />
              }
              stallNote={runStatus.kind === "stalled" ? runStatus.detail : undefined}
              onCancel={() => void cancelTurn("main")}
              onStopAndRetry={mainWedged ? () => stopAndRetry(MAIN_PANE) : undefined}
              sessionModel={sessionModel}
              chatRef={chatEl}
              pinToLatest={atBottom}
              sessionId={sessionId}
              loading={loadingSession}
              onScroll={(el) => {
                markScrolling(el);
                setAtBottomFrame(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
              }}
              onResendUser={(text) => submitPrompt(text)}
              rewindFor={rewindForItem}
              onForkTurn={() => void sendPrompt(forkAtSlash())}
              onInspectTool={review.inspectTool}
              onPreviewPath={(p) => void openPreview(p)}
              highlightQuery={searchJump}
              jumpId={jumpTurnId}
              onDraftUser={onDraftChange}
              atBottom={atBottom}
              onJumpBottom={() => {
                setAtBottom(true);
                if (chatEl.current) chatEl.current.scrollTop = chatEl.current.scrollHeight;
              }}
            />
          </div>
          {loadingSession && (
            <div className="overlay">
              <Skeleton label={t(locale, "toast.loadingSession")} rows={4} />
            </div>
          )}
          <Composer
            ref={composerRef}
            value={draft}
            onChange={onDraftChange}
            onSend={(text) => submitPrompt(text)}
            onAlt={(text) => altSubmit(text)}
            altLabel={steerByDefault ? t(locale, "composer.queue") : t(locale, "composer.steer")}
            busy={mainPaneBusy}
            blocked={hero.blocked || loadingSession}
            takeover={takeover}
            enterSends={enterSends}
            threadWidth={chatWidthCss(chatWidth)}
            commands={[...skillCommands, ...chat.commands]}
            onRunSlash={(cmd, rest) => void runSlash(cmd, rest)}
            cwd={cwd}
            grokHome={info?.grokHome ?? ""}
            listFiles={(q) => listProjectFiles(cwd, q)}
            mentionDirs={workspaceEntries.filter((e) => e.kind === "dir").map((e) => e.name)}
            mentionChanges={changes.map((c) => c.path)}
            mode={mode}
            onMode={(m) => void applyMode(m, "main")}
            effort={effort}
            onEffort={applyEffort}
            effortReady={effortReady}
            effortOptions={effortOptions}
            model={model}
            sessionModel={sessionModel}
            modelOptions={modelCatalog}
            modelLabels={modelLabels}
            onModel={applyModel}
            onSessionModel={applySessionModel}
            onOpenSettings={openSettings}
            selectedAgentId={selectedAgentId}
            onSelectedAgent={setSelectedAgentId}
            hasOpenSession={!!sessionId}
            queue={queue}
            onRemoveQueued={(id) => setQueue((q) => removeQueued(q, id))}
            onReorderQueued={(from, to) => setQueue((q) => reorderQueue(q, from, to))}
            onEditQueued={(id, text) => setQueue((q) => editQueued(q, id, text))}
            onOverflow={showToast}
            pendingMode={pendingMode}
            promptHistoryRef={promptHistoryRef}
            workspaceLabel={inboxCwd && cwd && sameCwd(cwd, inboxCwd) ? t(locale, "sidebar.inbox") : cwd ? basename(cwd) : ""}
            workspaceOptions={[
              ...(inboxCwd ? [{ path: INBOX_PIN, label: t(locale, "sidebar.inbox") }] : []),
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
              void setWorkspace(folder).catch((e) => showToast(friendlyError(e)));
            }}
            footer={<StatsLineView stats={turnStats} sessionTokens={usage?.used} usageHistory={usageHistory} />}
            metaActions={
              <>
                {sessionId ? (
                  <button
                    type="button"
                    className="icon-btn fork-btn"
                    aria-label={t(locale, "palette.fork")}
                    onClick={() => void sendPrompt("/fork")}
                  >
                    <IconGitFork size={16} />
                  </button>
                ) : null}
                <UsageRing
                  usage={usage ?? {}}
                  compactPercent={cli?.compactPercent ?? 85}
                  onCompact={(pct) => {
                    if (window.confirm(t(locale, "usage.compactAsk", { pct }))) void sendPrompt("/compact");
                  }}
                />
              </>
            }
          >
            <ComposerDock>
              {showRecap ? <RecapCard text={recapText} onDismiss={dismissRecap} /> : null}
              {sessionId && injectedSessions.has(sessionId) ? (
                <MemoryInjectChip
                  locale={locale}
                  onOpen={() => setExtraPage("memory")}
                  onDismiss={() => dismissInjectedSession(sessionId)}
                />
              ) : null}
              <RunStatusRegion status={runStatus} />
              {goalView && !mainPaneBusy ? (
                <GoalBar goal={goalView.text} startedAt={goalView.startedAt} />
              ) : null}
            </ComposerDock>
            {requestCards(
              MAIN_PANE,
              mainPermission,
              mainPermissionView.kind,
              cwd,
              sessionId,
              mainPermissionView.mainVisible,
            )}
            {showPlanComplete ? (
              <PlanCompleteCard
                onApprove={() => void applyMode("agent")}
                onReject={() => void sendPrompt(t(locale, "plan.rejectFeedback"))}
                onFeedback={(text) => void sendPrompt(text)}
              />
            ) : null}
            {mode === "plan" && !showPlanComplete ? (
              <button type="button" className="btn ghost" onClick={() => setPlanMarkedComplete(true)}>
                {t(locale, "plan.markComplete")}
              </button>
            ) : null}
          </Composer>
          </div>
          </div>
        </WorkPane>
        </ErrorBoundary>
        ) : (
          <div className="work-panes" ref={workColRef}>
            <PaneLayout tree={paneTree} onRatio={onPaneRatio} renderLeaf={renderSplitLeaf} />
          </div>
        )}
        {paneDrag ? (
          <PaneDropOverlay
            title={paneDrag.title}
            subtitle={paneDrag.subtitle}
            x={paneDrag.x}
            y={paneDrag.y}
            preview={paneDrag.preview}
            allowed={paneDrag.allowed}
          />
        ) : null}

      </main>
      {reviewPresence.shown ? (
        <>
          <Resizer
            ariaLabel={t(locale, "rail.resize")} value={previewWidth} min={PREVIEW.min}
            max={maxFor(PREVIEW, winWidth, sidebarWidth)} resetTo={PREVIEW.initial} direction={-1}
            onChange={(n) => {
              appRef.current?.style.setProperty("--review-w", `${n}px`);
            }}
            onCommit={(n) => {
              setPreviewWidth(n);
              persist({ previewWidth: n });
            }}
          />
          <ReviewRail activeTab={reconciledReviewTab} tabs={reviewTabs}
            leaving={reviewPresence.leaving}
            onTab={review.setTab} onClose={() => { review.close(); persist(persistReviewOpen(false)); }}>
            {{
              progress: reviewPlan.length > 0 ? <ul className="todo">{reviewPlan.map((e, i) => <li key={`${e.content}-${i}`} className={e.status || "pending"}><TodoMark status={e.status} /><span className="todo-text">{e.content}</span></li>)}</ul> : <p className="float-empty">{t(locale, "rail.emptyProgress")}</p>,
              files: turnFiles.length > 0 ? <FilePanel artifacts={turnFiles.map((path) => ({ path }))} cwd={reviewCwd} onOpenPath={(p) => void review.revealPath(p)} onPreview={(p) => void openPreview(p)} /> : <p className="float-empty">{t(locale, "rail.emptyFiles")}</p>,
              git: (
                <GitPane
                  status={git}
                  changes={changes}
                  commits={gitCommits}
                  branches={gitBranchList}
                  worktrees={gitWorktrees}
                  cwd={reviewCwd}
                  busy={worktreeBusy || gitBusy}
                  onNewWorktree={() => void newWorktreeSession()}
                  onSwitchWorktree={(path) => void switchWorktree(path)}
                  onCheckout={checkoutBranch}
                  onCommitted={() => void refreshGit()}
                  onToast={showToast}
                  onPreview={(p) => void openPreview(p)}
                  onReveal={(p) => void review.revealPath(p)}
                  onRefresh={() => void refreshGit()}
                  onPull={pullGit}
                  onPush={pushGit}
                  onDiscard={(path) => void discardChange(path)}
                  turnDiffItems={reviewItems}
                />
              ),
              preview: previewPath ? <PreviewPane path={previewPath} text={previewText} truncated={previewTruncated} error={previewError} cwd={reviewCwd} dark={resolvedTheme === "dark"} embedded tabs={review.previewTabs} onSelectTab={review.selectPreviewTab} onCloseTab={review.closePreviewTab} onReveal={(p) => void review.revealPath(p)} onAttach={(p) => attachToSession(p, "file")} onFollowLink={(e) => handleMdClick(e, reviewCwd, (p) => void openPreview(p))} onSave={(p, text) => { void writeAllowedText(p, text, reviewCwd || null).then(() => { review.setPreviewText(p, review.preview.requestId, text); showToast(t(locale, "toast.saved")); void refreshGit(); }).catch((e) => showToast(friendlyError(e))); }} /> : <p className="float-empty">{t(locale, "rail.emptyPreview")}</p>,
              explorer: (
                <ExplorerPane
                  cwd={reviewCwd}
                  expandedDirs={review.expandedDirs}
                  onToggleDir={review.toggleExplorerDir}
                  onPreview={(p) => void openPreview(p)}
                  onReveal={(p) => void review.revealPath(p)}
                  onAttach={attachToSession}
                />
              ),
              terminal: (
                <div className="review-stack">
                  <button type="button" className="btn primary" disabled={!reviewCwd} onClick={() => {
                    if (!reviewCwd) return;
                    void openInTerminal(reviewCwd).catch((e) => showToast(friendlyError(e)));
                  }}> {t(locale, "rail.openProject")}</button>
                  {terminalTools.length === 0 ? (
                    <p className="float-empty">{t(locale, "rail.emptyTerminal")}</p>
                  ) : terminalTools.map((tool) => (
                    <BashCommandRow key={tool.id} title={tool.title} onInspect={() => review.inspectTool(tool)} />
                  ))}
                </div>
              ),
            }}
          </ReviewRail>
        </>
      ) : null}
      </div>

      {menu && menuSession && (
        <SessionMenu
          session={menuSession}
          hasOverride={!!titles[menuSession.id]?.trim()}
          top={menu.top}
          left={menu.left}
          onRename={() => {
            const id = menuSession.id;
            setMenu(null);
            if (id === sessionIdRef.current || openIds.includes(id)) {
              beginEditTitle(id);
              return;
            }
            void (async () => {
              const s = findSessionById(id);
              if (s) await openSession(s);
              beginEditTitle(id);
            })();
          }}
          onRestore={() => restoreGenerated(menuSession.id)}
          onNew={() => {
            setMenu(null);
            if (inboxCwd && sameCwd(menuSession.cwd, inboxCwd)) void startInboxSession();
            else void startSession(menuSession.cwd);
          }}
          onNewLabel={inboxCwd && sameCwd(menuSession.cwd, inboxCwd) ? t(locale, "palette.newChat") : t(locale, "palette.newSession")}
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
            showToast(t(locale, "toast.copied"));
          }}
          onCopyCwd={() => {
            void navigator.clipboard.writeText(menuSession.cwd);
            setMenu(null);
            showToast(t(locale, "toast.copied"));
          }}
          onSplit={() => {
            setMenu(null);
            if (openIds.includes(menuSession.id)) void openSession(menuSession);
            else void splitRight(menuSession);
          }}
          onSplitLabel={openIds.includes(menuSession.id) ? t(locale, "pane.reveal") : t(locale, "pane.splitRight")}
          onFork={() => {
            const target = menuSession;
            setMenu(null);
            void (async () => {
              if (target.id !== sessionIdRef.current) await openSession(target);
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

      {settingsPresence.shown && (
        <div className={`settings-layer${settingsPresence.leaving ? " layer-out" : ""}`}>
          <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-head">
              <h2 id="settings-title">{t(locale, "settings.title")}</h2>
              <button type="button" className="icon-btn" aria-label={t(locale, "common.close")} onClick={() => setSettingsOpen(false)}>
                <IconGrokClose size={16} />
              </button>
            </div>
            <ErrorBoundary locale={locale}>
            <SettingsPanel
              focusSection={settingsFocus}
              onConsumedFocus={() => setSettingsFocus(null)}
              theme={theme}
              setTheme={(t) => { setTheme(t); persist({ theme: t }); }}
              locale={locale}
              onLocale={(l) => { setLocale(l); persist({ locale: l }); }}
              themeFamily={themeFamily}
              onThemeFamily={(f) => { setThemeFamily(f); persist({ themeFamily: f }); }}
              accentId={accentId}
              onAccentId={(id) => { setAccentId(id); persist({ accentId: id }); }}
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
                void ensureAgent().catch((e) => showToast(friendlyError(e)));
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
              sounds={sounds}
              onSounds={(v) => { setSounds(v); persist({ sounds: v }); }}
              allowedTools={[...allowedTools]}
              onRevokeTool={(key) => {
                const next = new Set(allowedTools);
                next.delete(key);
                setAllowedTools(next);
                persist({ allowedTools: [...next] });
              }}
              autoArchiveDays={autoArchiveDays}
              onAutoArchiveDays={(n) => { setAutoArchiveDays(n); persist({ autoArchiveDays: n }); }}
              steerByDefault={steerByDefault}
              onSteerByDefault={(v) => { setSteerByDefault(v); persist({ steerByDefault: v }); }}
              injectUserMemory={injectUserMemory}
              onInjectUserMemory={(v) => { setInjectUserMemory(v); persist({ injectUserMemory: v }); }}
              dreamingEnabled={dreamingEnabled}
              onDreamingEnabled={(v) => { setDreamingEnabled(v); persist({ dreamingEnabled: v }); }}
              dreamAgentId={dreamAgentId}
              onDreamAgentId={(id) => {
                if (!isAgentId(id)) return;
                setDreamAgentId(id);
                persist({ dreamAgentId: id });
              }}
              dreamThresholdSessions={dreamThresholdSessions}
              onDreamThresholdSessions={(n) => {
                setDreamThresholdSessions(n);
                persist({ dreamThresholdSessions: n });
              }}
              memoryMcpEnabled={memoryMcpEnabled}
              onMemoryMcpEnabled={(v) => {
                setMemoryMcpEnabled(v);
                persist({ memoryMcpEnabled: v });
              }}
              memoryDisplayName={memoryDisplayName}
              onMemoryDisplayName={(v) => {
                setMemoryDisplayName(v);
                persist({ memoryDisplayName: v });
              }}
              onOpenMemory={() => {
                setSettingsOpen(false);
                setExtraPage("memory");
              }}
              dreamAgentOptions={doctors.filter((d) => d.authPresent).map((d) => ({
                id: d.agentId,
                label: agentChipLabel(d.agentId),
              }))}
              cli={cli}
              onCli={(next) => {
                setCli(next);
                if (next.model) setModel(next.model);
                setShowThinking(next.showThinking);
                if (next.yolo) setMode("yolo");
              }}
              info={info}
            />
            </ErrorBoundary>
          </div>
        </div>
      )}

      <ErrorBoundary locale={locale}>
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
      </ErrorBoundary>

      <ExtraOverlay
        page={extraPage}
        onClose={() => setExtraPage(null)}
        onSlash={(cmd) => {
          setExtraPage(null);
          const name = cmd.trim().split(/\s/)[0];
          if (name === "/config-agents") return;
          void sendPrompt(cmd);
        }}
        onOpenPath={(p) => {
          setExtraPage(null);
          void openPath(p);
        }}
        onOpenSession={(id) => {
          setExtraPage(null);
          const s = allSessions.find((x) => x.id === id);
          if (s) void openSession(s);
        }}
        images={imagineImages}
        videos={imagineVideos}
        agents={agentRows}
        dashboard={[...dashboardSessions]}
        memoryPath={memoryPath}
        agentsPath={agentsMdPath}
        cwd={cwd || inboxCwd}
        locale={locale}
        diary={dreamDiary}
        status={dreamStatus}
        corpus={dreamCorpus}
        onDreamNow={onDreamNow}
        onFoundingNow={onFoundingNow}
        foundingAt={foundingAt}
        proposals={dreamProposals}
        onProposalApprove={onProposalApprove}
        onProposalDismiss={onProposalDismiss}
        userMdPath={dreamUserMdPath || undefined}
        dreamsMdPath={dreamDreamsMdPath || undefined}
        tagline={dreamTagline}
        displayName={memoryDisplayName}
        onOpenMemorySettings={() => {
          setExtraPage(null);
          setSettingsOpen(true);
          setSettingsFocus("memory");
        }}
        usagePoints={usageHistory}
        usageDays={usageDays}
        onUsageDays={setUsageDays}
        subagents={subagentCards.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
        }))}
      />

      {movePick && (
        <div className="menu" style={{ top: movePick.top, left: movePick.left }} role="menu">
          <div className="footnote" style={{ padding: "6px 10px 4px" }}>{t(locale, "menu.moveToProject")}</div>
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
            const s = findSessionById(id);
            if (!s) return null;
            return (
              <button
                key={id}
                type="button"
                className={id === sessionId ? "on" : ""}
                onClick={() => {
                  setMruOpen(false);
                  void openSession(s);
                }}
              >
                {i + 1} {displayTitle(s, titles, sessionPreviews)}
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
      {palettePresence.shown && (
        <CommandPalette
          items={palette.items}
          onPick={palette.run}
          leaving={palettePresence.leaving}
          onSearch={(query) => {
            void searchSessionText(query)
              .then((hits) => {
                setSearchHits(hits);
                setSearchJump(query);
                palette.setOpen(false);
                if (hits.length === 1) {
                  const s = allSessions.find((x) => x.id === hits[0].sessionId);
                  if (s) void openSession(s);
                }
              })
              .catch((e) => {
                showToast(friendlyError(e));
              });
          }}
          onClose={() => palette.setOpen(false)}
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
      <SelectionActions
        viewport={{ width: window.innerWidth, height: window.innerHeight }}
        locale={locale}
        onRewrite={(next) => {
          onDraftChange(next);
          requestAnimationFrame(() => {
            document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
          });
        }}
        onQuote={(quote) => {
          onDraftChange(draft ? `${draft}\n${quote}` : quote);
          requestAnimationFrame(() => {
            document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
          });
        }}
      />
      {toastPresence.shown && toastHold.current && (
        <div
          className={`toast${toastPresence.leaving ? " toast-out" : ""}`}
          role="status"
          onMouseEnter={pauseToast}
          onMouseLeave={resumeToast}
          onFocus={pauseToast}
          onBlur={resumeToast}
        >
          <span>{toastHold.current.message}</span>
          {toastHold.current.actionLabel && toastHold.current.onAction ? (
            <>
              <span className="toast-sep" aria-hidden="true">·</span>
              <button type="button" className="toast-action" onClick={toastHold.current.onAction}>
                {toastHold.current.actionLabel}
              </button>
            </>
          ) : null}
        </div>
      )}
      <AppModal
        open={!!appConfirm}
        title={appConfirm?.title ?? ""}
        body={appConfirm?.body ?? ""}
        confirmLabel={appConfirm?.confirmLabel ?? t(locale, "common.ok")}
        onConfirm={confirmAppModal}
        onCancel={cancelAppModal}
      />
    </div>
    </LocaleProvider>
    </ShortcutProvider>
  );
}
