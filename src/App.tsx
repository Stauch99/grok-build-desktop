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
} from "./api";
import { formatElapsed, liveWorkStatus } from "./lib/chat";
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
import { busyComposerHint, paneComposerTakeover, SIDEBAR_RAIL } from "./lib/shell-ia";
import { GROK_LOGIN_CMD } from "./lib/agent-health";
import { forkAtSlash } from "./lib/turn-files";
import { RecapCard } from "./components/RecapCard";
import { GoalBar } from "./components/GoalBar";
import { ComposerDock } from "./components/ComposerDock";
import { StatsLineView } from "./components/StatsLineView";
import { MillerPicker } from "./components/MillerPicker";
import { Resizer } from "./components/Resizer";
import { persistReviewOpen } from "./lib/review-rail";
import { displayTitle } from "./lib/projects";
import { MAIN_PANE } from "./lib/pane-tree";
import { selectPaneMentionSource } from "./lib/pane-mentions";
import { derivePermissionView } from "./lib/permission-view";
import { turnStatsFromItems } from "./lib/usage-split";
import { PaneLayout } from "./components/PaneLayout";
import { PaneDropOverlay } from "./components/PaneDropOverlay";
import { isArchived, isPinned, toggleId } from "./lib/session-chrome";
import { INBOX_PIN } from "./lib/sidebar-list";
import { allowForSession, findAlwaysOption, parseToolName, pickAllowOption } from "./lib/permission-allow";
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
import { MemoryDock } from "./components/MemoryDock";
import { MemoryInjectChip } from "./components/MemoryInjectChip";
import { handleMdClick, ThreadColumn, WaitPill } from "./components/Thread";
import { UsageRing } from "./components/UsageRing";
import { GitChip } from "./components/GitBar";
import { GitPane } from "./components/GitPane";
import { DiffSummary } from "./components/DiffSummary";
import { PlanCompleteCard } from "./components/PlanCompleteCard";
import { SubagentCard } from "./components/SubagentCard";
import { ExtraOverlay } from "./components/ExtraOverlay";
import { MenuSelect } from "./components/MenuSelect";
import { Composer } from "./components/Composer";
import { CommandPalette } from "./components/CommandPalette";
import { EmptyState } from "./components/EmptyState";
import { AppModal } from "./components/AppModal";
import { RewindDialog } from "./components/RewindDialog";
import { snapshotMtimes } from "./lib/memory-dock";
import { basename } from "./lib/text";
import { IconGrokClose, IconGrokCopy, IconGrokMore, IconGrokSidebar } from "./grok-icons";
import { IconChevron, IconGitFork } from "./icons";
import { TodoMark } from "./components/TodoMark";
import { ShortcutKbd, ShortcutProvider } from "./components/ShortcutHint";
import { useAppModel } from "./hooks/useAppModel";

export function App() {
  const {
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
    setLastWorkspace,
    sidebarList,
    setSidebarList,
    pinnedProjects,
    setPinnedProjects,
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
    injectedSessions,
    dismissInjectedSession,
    dreamDiary,
    dreamStatus,
    dreamCorpus,
    dreamUserMdPath,
    onDreamNow,
    profileUpdated,
    dismissProfileUpdated,
    setInjectUserMemory,
    dreamingEnabled,
    setDreamingEnabled,
    dreamAgentId,
    setDreamAgentId,
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
    goalView,
    health,
    runStatus,
    turnStats,
  } = useAppModel();

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
    const paneTitle = paneSession ? displayTitle(paneSession, titles) : "新会话";
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
      plan: paneId === MAIN_PANE && planComplete,
    });
    const paneTurns = paneChat.items.filter((i): i is Extract<typeof i, { kind: "user" }> => i.kind === "user");
    const paneStats = turnStatsFromItems(paneChat.items, paneChat.usage?.output, {
      now: Date.now(),
      live: paneBusy,
    });
    const busyAt = extra ? extraBusyStartRef.current[paneId] ?? null : null;
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
    return (
      <div
        className={`pane${focusedPaneId === paneId ? " is-focused" : ""}`}
        onPointerDown={() => focusPane(paneId)}
        onFocusCapture={() => {
          focusedPermissionPaneRef.current = paneId;
          focusPane(paneId);
        }}
      >
        <header
          className="workspace-head"
          onPointerDown={(e) => {
            if (!paneSession) return;
            if ((e.target as HTMLElement).closest("button, input, [data-menu-trigger]")) return;
            beginPaneDrag(e, paneSession);
          }}
        >
          <div className="title-wrap">
            <span className="crumb-cwd" title={paneCwd}>
              {inboxCwd && paneCwd && sameCwd(paneCwd, inboxCwd) ? "无目录" : basename(paneCwd || "")}
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
                <button type="button" className="session-title-btn" title={paneTitle} onClick={() => beginEditTitle(sid)}>
                  {paneTitle}
                </button>
                <button type="button" className="icon-btn" title="复制全部对话" aria-label="复制全部对话" onClick={() => copyAllConversation(paneChat.items)}>
                  <IconGrokCopy size={16} />
                </button>
                <button type="button" className="icon-btn" data-menu-trigger aria-label="会话操作" onClick={(e) => openMenu("header", sid, e.currentTarget)}>
                  <IconGrokMore size={18} />
                </button>
              </>
            ) : (
              <span className="title-static">新会话</span>
            )}
          </div>
          <div className="head-actions">
            <button
              type="button"
              className="icon-btn shortcut-host"
              title="Dashboard"
              aria-label="Dashboard"
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
              <button type="button" className="icon-btn" title={t(locale, "pane.close")} aria-label={t(locale, "pane.close")} onClick={() => closePaneLeaf(paneId)}>
                <IconGrokClose size={16} />
              </button>
            ) : null}
          </div>
        </header>
        <div className="chat-shell">
          <ThreadColumn
            paneId={paneId}
            chat={paneChat}
            chatWidth={chatWidth}
            dark={theme === "dark"}
            cwd={paneCwd}
            showThinking={showThinking}
            empty={paneChat.items.length === 0}
            emptyTitle=""
            sessionModel={paneSession?.model ?? null}
            urlChips={[]}
            busy={paneBusy}
            onCancel={() => void cancelTurn(paneId)}
            chatRef={paneChatRef}
            onScroll={(el) => {
              const at = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (paneId === MAIN_PANE) setAtBottom(at);
              else onExtraAtBottom(paneId, at);
            }}
            turns={paneTurns}
            onResendUser={(text) => submitPrompt(text, paneId)}
          />
          {!paneAtBottom && paneChat.items.length > 0 && (
            <button
              type="button"
              className="jump-bottom"
              title="回到底部"
              aria-label="回到底部"
              onClick={() => {
                if (paneId === MAIN_PANE) {
                  setAtBottom(true);
                  chatEl.current?.scrollTo({ top: chatEl.current.scrollHeight, behavior: "smooth" });
                } else {
                  onExtraAtBottom(paneId, true);
                  extraChatEls.current[paneId]?.scrollTo({ top: extraChatEls.current[paneId]!.scrollHeight, behavior: "smooth" });
                }
              }}
            >
              <IconChevron size={16} />
            </button>
          )}
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
          effortReady={!!cli}
          model={model}
          sessionModel={paneSession?.model ?? null}
          modelOptions={modelCatalog}
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
          onOverflow={showToast}
          footer={<StatsLineView stats={paneStats} sessionTokens={paneChat.usage?.used} usageHistory={usageHistory} />}
          metaActions={<UsageRing usage={paneChat.usage ?? {}} compactPercent={cli?.compactPercent ?? 85} />}
        >
          <ComposerDock>
            {paneBusy && (
              <WaitPill
                status={liveWorkStatus(paneChat.items)}
                elapsed={busyAt != null ? formatElapsed(Date.now() - busyAt + clock * 0) : "0秒"}
                onStop={() => void cancelTurn(paneId)}
              />
            )}
          </ComposerDock>
          {perm && permView.kind && (paneId === MAIN_PANE ? permView.mainVisible : permView.splitVisible) && (
            <PendingRequestCard
              kind={permView.kind}
              title={perm.title}
              options={perm.options}
              onPick={(id) => void answerPermission(perm, id)}
              onAlwaysAllow={permView.kind === "permission" ? () => {
                const id = perm.sessionId || sid;
                const tool = parseToolName(perm.title, perm.toolKind);
                if (id) setAllowedTools((prev) => allowForSession(prev, id, tool));
                const pick = findAlwaysOption(perm.options) ?? pickAllowOption(perm.options);
                if (pick) void answerPermission(perm, pick);
              } : undefined}
            />
          )}
        </Composer>
      </div>
    );
  }

return (
    <ShortcutProvider shortcuts={shortcuts}>
    <LocaleProvider locale={locale}>
    <div
      className="app"
      lang={locale === "en" ? "en" : "zh-CN"}
      style={{
        ["--md-size" as string]: `${normalizeChatFontSize(chatFontSize)}px`,
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
        onSearch={() => palette.setOpen(true)}
        searchHits={searchHits}
        onOpenHit={(id) => {
          const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
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
        sessionId={sessionId}
        openIds={openIds}
        focusedId={focusedSessionId}
        titles={titles}
        expandedIds={expandedIds}
        collapsedIds={collapsedIds}
        onToggleExpand={toggleExpand}
        onOpenSession={(s) => void openSession(s)}
        onSessionMenu={(id, el, point) => openMenu("row", id, el, point)}
        onNewChat={() => void newChatInFocus()}
        onDragSession={beginPaneDrag}
        onAddProject={() => void addProject()}
        picking={picking}
        statusFor={statusFor}
        width={sidebarCollapsed ? SIDEBAR_RAIL : sidebarWidth}
        collapsed={sidebarCollapsed}
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
        max={maxFor(SIDEBAR, winWidth, reviewOpen ? previewWidth : 0)}
        resetTo={SIDEBAR.initial}
        onChange={setSidebarWidth}
        onCommit={(n) => persist({ sidebarWidth: n })}
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
                void ensureAgent().catch((e) => showToast(String(e)));
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
        <div className="pane solo">
          <div className="pane-body">
          <div className="work-col" ref={workColRef}>
          <header className="workspace-head" data-tauri-drag-region>
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
                    title="复制全部对话"
                    aria-label="复制全部对话"
                    onClick={() => copyAllConversation(chat.items)}
                  >
                    <IconGrokCopy size={16} />
                  </button>
                  <DiffSummary
                    items={chat.items}
                    onOpen={() => openReview("changed-file")}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    data-menu-trigger
                    aria-label="会话操作"
                    onClick={(e) => openMenu("header", sessionId, e.currentTarget)}
                  >
                    <IconGrokMore size={18} />
                  </button>
                </>
              ) : (
                <span className="title-static">新会话</span>
              )}
            </div>
            <div className="head-actions">
              {git?.isRepo ? (
                <GitChip status={git} onClick={() => openReview("changed-file")} />
              ) : null}
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
              {(
                <button
                  type="button"
                  className="icon-btn shortcut-host"
                  title="Dashboard"
                  aria-label="Dashboard"
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
                    showToast(t(locale, "toast.copiedLogin"));
                  }}
                  onBrowseWorkspace={() => setMillerOpen(true)}
                />
              }
              urlChips={urlChips}
              busy={mainPaneBusy}
              onCancel={() => void cancelTurn("main")}
              sessionModel={sessionModel}
              chatRef={chatEl}
              onScroll={(el) => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)}
              turns={userTurns}
              onResendUser={(text) => submitPrompt(text)}
              rewindFor={rewindForItem}
              onForkTurn={() => void sendPrompt(forkAtSlash())}
              onInspectTool={review.inspectTool}
              onPreviewPath={(p) => void openPreview(p)}
              highlightQuery={searchJump}
              jumpId={jumpTurnId}
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
              <div>{t(locale, "toast.loadingSession")}</div>
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
            busyHint={busyComposerHint(steerByDefault, locale)}
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
            effortReady={!!cli}
            model={model}
            sessionModel={sessionModel}
            modelOptions={modelCatalog}
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
            workspaceLabel={inboxCwd && cwd && sameCwd(cwd, inboxCwd) ? t(locale, "sidebar.inbox") : cwd ? basename(cwd) : ""}
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
            footer={<StatsLineView stats={turnStats} sessionTokens={usage?.used} usageHistory={usageHistory} />}
            metaActions={
              <>
                {sessionId ? (
                  <button
                    type="button"
                    className="icon-btn fork-btn"
                    title="分叉会话"
                    aria-label="分叉会话"
                    onClick={() => void sendPrompt("/fork")}
                  >
                    <IconGitFork size={16} />
                  </button>
                ) : null}
                <UsageRing
                  usage={usage ?? {}}
                  compactPercent={cli?.compactPercent ?? 85}
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
              {profileUpdated && dreamUserMdPath ? (
                <MemoryDock
                  title={t(locale, "memory.dockUpdated")}
                  changes={[{ path: dreamUserMdPath, mtime: Date.now() }]}
                  onOpen={() => {
                    setExtraPage("memory");
                    dismissProfileUpdated();
                  }}
                  onDismiss={dismissProfileUpdated}
                />
              ) : null}
              <RunStatusRegion status={runStatus} />
              {subagentCards.map((s) =>
                s.status ? (
                  <SubagentCard key={s.id} name={s.name} status={s.status} mcpInheritance="inherit" />
                ) : null,
              )}
              {goalView ? (
                <GoalBar goal={goalView.text} startedAt={goalView.startedAt} live={mainPaneBusy} />
              ) : null}
            </ComposerDock>
            {planComplete ? (
              <PlanCompleteCard
                onApprove={() => void applyMode("agent")}
                onReject={() => showToast(t(locale, "toast.planRejected"))}
                onFeedback={(text) => void sendPrompt(text)}
              />
            ) : null}
            {mainPermission && mainPermissionView.mainVisible && mainPermissionView.kind && (
              <PendingRequestCard
                kind={mainPermissionView.kind}
                title={mainPermission.title}
                options={mainPermission.options}
                timedOut={mainPermission.timedOut}
                timeoutNotice={permissionTimeoutNotice(locale)}
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
          </div>
        </div>
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
      {reviewOpen ? (
        <>
          <Resizer
            ariaLabel={t(locale, "rail.resize")} value={previewWidth} min={PREVIEW.min}
            max={maxFor(PREVIEW, winWidth, sidebarWidth)} resetTo={PREVIEW.initial} direction={-1}
            onChange={setPreviewWidth} onCommit={(n) => persist({ previewWidth: n })}
          />
          <ReviewRail activeTab={reconciledReviewTab} tabs={reviewTabs}
            width={previewWidth}
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
                />
              ),
              preview: previewPath ? <PreviewPane path={previewPath} text={previewText} truncated={previewTruncated} error={previewError} cwd={reviewCwd} dark={theme === "dark"} embedded tabs={review.previewTabs} onSelectTab={review.selectPreviewTab} onCloseTab={review.closePreviewTab} onReveal={(p) => void review.revealPath(p)} onFollowLink={(e) => handleMdClick(e, reviewCwd, (p) => void openPreview(p))} onSave={(p, text) => { void writeAllowedText(p, text, reviewCwd || null).then(() => { review.setPreviewText(p, review.preview.requestId, text); showToast(t(locale, "toast.saved")); void refreshGit(); }).catch((e) => showToast(String(e))); }} /> : <p className="float-empty">{t(locale, "rail.emptyPreview")}</p>,
              explorer: (
                <ExplorerPane
                  cwd={reviewCwd}
                  onPreview={(p) => void openPreview(p)}
                  onReveal={(p) => void review.revealPath(p)}
                />
              ),
              terminal: (
                <div className="review-stack">
                  <button type="button" className="btn primary" disabled={!reviewCwd} onClick={() => {
                    if (!reviewCwd) return;
                    void openInTerminal(reviewCwd).catch((e) => showToast(String(e)));
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
              const s = sessions.find((x) => x.id === id) ?? inboxSessions.find((x) => x.id === id);
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

      {settingsOpen && (
        <div className="settings-layer">
          <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-head">
              <h2 id="settings-title">设置</h2>
              <button type="button" className="icon-btn" aria-label="关闭" title="关闭" onClick={() => setSettingsOpen(false)}>
                <IconGrokClose size={16} />
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
        userMdPath={dreamUserMdPath || undefined}
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
                  void openSession(s);
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
      {palette.open && (
        <CommandPalette
          items={palette.items}
          onPick={palette.run}
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
                showToast(String(e));
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
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <>
              <span className="toast-sep" aria-hidden="true">·</span>
              <button type="button" className="toast-action" onClick={toast.onAction}>
                {toast.actionLabel}
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
