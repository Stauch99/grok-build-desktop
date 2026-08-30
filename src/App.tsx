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
import { agentChipLabel } from "./lib/agent-chip";
import { isAgentId } from "./lib/agent-id";
import { t } from "./lib/i18n";
import { permissionTimeoutNotice } from "./lib/permission-copy";
import { editQueued, removeQueued, reorderQueue } from "./lib/prompt-queue";
import { maxFor, PREVIEW, SIDEBAR } from "./lib/layout";
import { busyComposerHint, SIDEBAR_RAIL } from "./lib/shell-ia";
import { GROK_LOGIN_CMD } from "./lib/agent-health";
import { forkAtSlash } from "./lib/turn-files";
import { GoalBar } from "./components/GoalBar";
import { StatsLineView } from "./components/StatsLineView";
import { MillerPicker } from "./components/MillerPicker";
import { Resizer } from "./components/Resizer";
import { persistReviewOpen } from "./lib/review-rail";
import { displayTitle } from "./lib/projects";
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
import { RunStatusRegion } from "./components/RunStatusRegion";
import { MemoryDock } from "./components/MemoryDock";
import { MemoryInjectChip } from "./components/MemoryInjectChip";
import { handleMdClick, ThreadColumn, WaitPill } from "./components/Thread";
import { UsageRing } from "./components/UsageRing";
import { GitHistory } from "./components/GitHistory";
import { DiffSummary } from "./components/DiffSummary";
import { PlanCompleteCard } from "./components/PlanCompleteCard";
import { SubagentCard } from "./components/SubagentCard";
import { ExtraOverlay } from "./components/ExtraOverlay";
import { MenuSelect } from "./components/MenuSelect";
import { Composer } from "./components/Composer";
import { CommandPalette } from "./components/CommandPalette";
import { ChangesPanel } from "./components/ChangesPanel";
import { GitBar } from "./components/GitBar";
import { EmptyState } from "./components/EmptyState";
import { AppModal } from "./components/AppModal";
import { RewindDialog } from "./components/RewindDialog";
import { snapshotMtimes } from "./lib/memory-dock";
import { basename } from "./lib/text";
import { IconGrokClose, IconGrokMore, IconGrokSidebar } from "./grok-icons";
import { IconChevron, IconGitFork } from "./icons";
import { TodoMark } from "./components/TodoMark";
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
    density,
    setDensity,
    hideToTray,
    setHideToTray,
    defaultRail,
    setDefaultRail,
    shortcuts,
    setShortcuts,
    inspect,
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
    split,
    setSplit,
    splitDraft,
    setSplitDraft,
    splitBusy,
    setSplitBusy,
    splitAtBottom,
    setSplitAtBottom,
    splitBusyAt,
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
    queue,
    setQueue,
    splitQueue,
    setSplitQueue,
    steerByDefault,
    setSteerByDefault,
    injectUserMemory,
    injectedSessions,
    dismissInjectedSession,
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
    splitChatEl,
    composerRef,
    splitComposerRef,
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
    startNewChat,
    startSession,
    resumeSession,
    openSplit,
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
    applyRewind,
    toggleExpand,
    currentTitle,
    sessionModel,
    cwdLocked,
    menuSession,
    usage,
    plan,
    splitSession,
    splitTitle,
    userTurns,
    splitTurns,
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
    splitPermissionView,
    splitMentions,
    takeover,
    splitTakeover,
    hero,
    turnFiles,
    terminalTools,
    reviewTabs,
    reconciledReviewTab,
    jobs,
    catalog,
    goal,
    health,
    runStatus,
    turnStats,
    splitTurnStats,
    splitPermission,
  } = useAppModel();

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
        onSearch={() => palette.setOpen(true)}
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
        onSessionMenu={(id, el, point) => openMenu("row", id, el, point)}
        onNewChat={() => void startNewChat()}
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
              {!split && (
                <GitBar
                  status={git}
                  busy={worktreeBusy}
                  onOpenChanges={() => openReview("changed-file")}
                  onNewWorktree={() => void newWorktreeSession()}
                  onCommitted={() => void refreshGit()}
                />
              )}
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
                  <IconGrokSidebar size={18} mirror />
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
            selectedAgentId={selectedAgentId}
            onSelectedAgent={setSelectedAgentId}
            hasOpenSession={!!sessionId}
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
            <RunStatusRegion status={runStatus} />
            {goal ? <GoalBar goal={goal} /> : null}
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
              <ReviewRail activeTab={reconciledReviewTab} tabs={reviewTabs}
                width={previewWidth}
                onTab={review.setTab} onClose={() => { review.close(); persist(persistReviewOpen(false)); }}>
                {{
                  progress: plan.length > 0 ? <ul className="todo">{plan.map((e, i) => <li key={`${e.content}-${i}`} className={e.status || "pending"}><TodoMark status={e.status} />{e.content}</li>)}</ul> : <p className="float-empty">本轮还没有进度。</p>,
                  files: turnFiles.length > 0 ? <FilePanel artifacts={turnFiles.map((path) => ({ path }))} cwd={cwd} onOpenPath={(p) => void review.revealPath(p)} onPreview={(p) => void openPreview(p)} /> : <p className="float-empty">本轮还没有文件。</p>,
                  changes: <div className="review-stack"><ChangesPanel changes={changes} isRepo={!!git?.isRepo} onPreview={(p) => void openPreview(p)} onReveal={(p) => void review.revealPath(p)} onRefresh={() => void refreshGit()} /><GitHistory commits={gitCommits} branches={gitBranchList} /></div>,
                  preview: previewPath ? <PreviewPane path={previewPath} text={previewText} truncated={previewTruncated} error={previewError} cwd={cwd} dark={theme === "dark"} embedded tabs={review.previewTabs} onSelectTab={review.selectPreviewTab} onCloseTab={review.closePreviewTab} onReveal={(p) => void review.revealPath(p)} onFollowLink={(e) => handleMdClick(e, cwd, (p) => void openPreview(p))} onSave={(p, text) => { void writeAllowedText(p, text, cwd || null).then(() => { review.setPreviewText(p, review.preview.requestId, text); showToast("已保存"); void refreshGit(); }).catch((e) => showToast(String(e))); }} /> : <p className="float-empty">选择文件后在此预览。</p>,
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
            <header className="workspace-head" data-tauri-drag-region>
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
                      <IconGrokMore size={18} />
                    </button>
                  </>
                )}
              </div>
              <div className="head-actions">
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
                  <IconGrokClose size={16} />
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
              selectedAgentId={selectedAgentId}
              onSelectedAgent={setSelectedAgentId}
              hasOpenSession={!!sessionId}
              queue={splitQueue}
              onRemoveQueued={(id) => setSplitQueue((q) => removeQueued(q, id))}
              onReorderQueued={(from, to) => setSplitQueue((q) => reorderQueue(q, from, to))}
              onOverflow={showToast}
              footer={<StatsLineView stats={splitTurnStats} sessionTokens={split.chat.usage?.used} usageHistory={usageHistory} />}
              metaActions={
                <UsageRing
                  usage={split.chat.usage ?? {}}
                  compactPercent={cli?.compactPercent ?? 85}
                />
              }
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
          if (s) void resumeSession(s);
        }}
        images={imagineImages}
        videos={imagineVideos}
        agents={agentRows}
        dashboard={[...dashboardSessions]}
        memoryPath={memoryPath}
        agentsPath={agentsMdPath}
        cwd={cwd || inboxCwd}
        locale={locale}
        diary={[]}
        status={{ kind: "idle", lastAt: null }}
        corpus={null}
        onDreamNow={() => {}}
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
                  if (s) void resumeSession(s);
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
      {toast && <div className="toast">{toast}</div>}
      <AppModal
        open={!!appConfirm}
        title={appConfirm?.title ?? ""}
        body={appConfirm?.body ?? ""}
        confirmLabel={appConfirm?.confirmLabel ?? "确定"}
        onConfirm={confirmAppModal}
        onCancel={cancelAppModal}
      />
    </div>
  );
}
