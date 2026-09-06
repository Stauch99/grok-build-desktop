import { useCallback, useMemo } from "react";
import type { ChatItem, ChatState } from "../lib/chat";
import { effortsForModel, modelLabelMap, type AgentModelRow } from "../lib/agent-models";
import { skillSlashCommands, type InspectReport } from "../lib/inspect";
import { recapIdentity, shouldShowSessionRecap } from "../lib/session-recap";
import { liveBusyIds, runningChildSessionIds } from "../lib/live-roster";
import { lastTurnFiles } from "../lib/turn-files";
import { headerJobs } from "../lib/jobs-header";
import { agentHealth } from "../lib/agent-health";
import { bashTools } from "../lib/tool-render";
import { deriveRunStatus, mainPaneIsBusy } from "../lib/run-status";
import { derivePermissionView } from "../lib/permission-view";
import { selectPanePermissions, type QueuedPermission } from "../lib/permission-queue";
import { deriveReviewTabs, reconcileReviewTab, type ReviewTab } from "../lib/review-rail";
import { stallNote } from "../lib/stall";
import { paneComposerTakeover, heroLayout } from "../lib/shell-ia";
import { shouldBlockIdleComposer } from "../lib/agent-warmup";
import { turnStatsFromItems } from "../lib/usage-split";
import { displayTitle } from "../lib/projects";
import { buildSidebarSections, type SidebarListPrefs } from "../lib/sidebar-list";
import type { ProjectGroupState } from "../lib/project-groups";
import { deriveStatus, type SessionStatus, type UnreadMap } from "../lib/session-status";
import { planRevert, previewRevert } from "../lib/checkpoint";
import { openIdsFromBindings } from "../lib/session-presence";
import { sameCwd } from "../lib/inbox";
import { t, type Locale } from "../lib/i18n";
import type { Mode } from "../lib/mode";
import type { GoalView } from "../lib/goal-bar";
import type { SessionSummary, PlanFile, RuleFile, GitChange } from "../api";
import type { ExtraPaneState } from "./useAcpSession";
import { MAIN_PANE, leafIds, type Bindings, type PaneNode } from "../lib/pane-tree";
import type { SubagentChipModel } from "../lib/subagent-tree";

export type AppModelViewInput = {
  locale: Locale;
  busy: boolean;
  runningSessionId: string | null;
  extraPanes: Record<string, ExtraPaneState>;
  allSessions: SessionSummary[];
  awaitingId: string | null;
  unread: UnreadMap;
  projects: string[];
  inboxCwd: string;
  pinned: string[];
  pinnedProjects: string[];
  projectGroups: ProjectGroupState;
  archived: string[];
  autoArchiveDays: number;
  sidebarList: SidebarListPrefs;
  titles: Record<string, string>;
  sessionTokens: Record<string, number>;
  clock: number;
  chat: ChatState;
  rewindTarget: number | null;
  sessionId: string | null;
  selectedAgentId: string;
  mode: Mode;
  cwd: string;
  modelRows: AgentModelRow[];
  model: string;
  permissions: QueuedPermission[];
  extraPaneList: Array<{ id: string; sessionId: string; busy: boolean }>;
  extraBusy: boolean;
  connecting: boolean;
  ready: boolean;
  sawExit: boolean;
  inspect: InspectReport | null;
  lastActivityAt: number;
  focusedExtra: ExtraPaneState | undefined;
  planFile: PlanFile | null;
  rules: RuleFile[];
  detailsTool: unknown;
  previewPath: string;
  changes: GitChange[];
  reviewTab: ReviewTab;
  defaultRail: "tasks" | "changes" | "context";
  goalView: GoalView | null;
  dismissedRecap: string | null;
  liveBindings: () => Bindings;
  focusedPaneId: string;
  paneTree: PaneNode;
  subagentCards: SubagentChipModel[];
  current: SessionSummary | null;
};

export function useAppModelView(input: AppModelViewInput) {
  const busyIds = useMemo(() => {
    const ids: string[] = [];
    if (input.busy && input.runningSessionId) ids.push(input.runningSessionId);
    for (const pane of Object.values(input.extraPanes)) {
      if (pane.busy && pane.sessionId) ids.push(pane.sessionId);
    }
    ids.push(...liveBusyIds(input.allSessions));
    ids.push(...runningChildSessionIds(input.chat.items));
    return ids;
  }, [input.busy, input.runningSessionId, input.extraPanes, input.allSessions, input.chat.items]);

  const statusFor = useCallback(
    (id: string): SessionStatus => deriveStatus({ id, busyIds, awaitingId: input.awaitingId, unread: input.unread }),
    [busyIds, input.awaitingId, input.unread],
  );

  const sidebarSections = useMemo(
    () =>
      buildSidebarSections({
        sessions: input.allSessions,
        projects: input.projects,
        inboxCwd: input.inboxCwd,
        pinned: input.pinned,
        pinnedProjects: input.pinnedProjects,
        projectGroups: input.projectGroups,
        archived: input.archived,
        autoArchiveDays: input.autoArchiveDays,
        now: Date.now(),
        prefs: input.sidebarList,
        titles: input.titles,
        statusFor,
        sessionTokens: input.sessionTokens,
      }),
    [
      input.allSessions,
      input.projects,
      input.inboxCwd,
      input.pinned,
      input.pinnedProjects,
      input.projectGroups,
      input.archived,
      input.autoArchiveDays,
      input.clock,
      input.sidebarList,
      input.titles,
      statusFor,
      input.sessionTokens,
    ],
  );

  const visibleHotkeySessions = useMemo(
    () => sidebarSections.flatMap((section) => section.rows.map((r) => r.session.id)).slice(0, 9),
    [sidebarSections],
  );

  const rewindIndex = useMemo(() => {
    const byId = new Map<string, number>();
    let lastEdit = -1;
    input.chat.items.forEach((item, i) => {
      byId.set(item.id, i);
      if (item.kind === "tool" && item.diff?.path) lastEdit = i;
    });
    return { byId, lastEdit };
  }, [input.chat.items]);

  const rewindPreview = useMemo(() => {
    if (input.rewindTarget == null) return null;
    return {
      plan: planRevert(input.chat.items, input.rewindTarget),
      rows: previewRevert(input.chat.items, input.rewindTarget),
    };
  }, [input.rewindTarget, input.chat.items]);

  const modelCatalog = useMemo(() => input.modelRows.map((row) => row.id), [input.modelRows]);
  const effortOptions = useMemo(() => effortsForModel(input.modelRows, input.model), [input.modelRows, input.model]);
  const modelLabels = useMemo(() => modelLabelMap(input.modelRows), [input.modelRows]);

  const current = input.current;
  const currentTitle = current
    ? displayTitle(current, input.titles)
    : input.sessionId
      ? t(input.locale, "app.newSession")
      : t(input.locale, "app.newChat");
  const sessionModel = current?.model ?? null;
  const isInbox = !!(input.inboxCwd && input.cwd && sameCwd(input.cwd, input.inboxCwd));
  const cwdLocked = !!(
    input.sessionId &&
    !isInbox &&
    input.chat.items.some((i) => i.kind === "user" || i.kind === "assistant")
  );
  const usage = input.chat.usage;
  const plan = input.chat.plan;
  const reviewChat = input.focusedExtra?.chat ?? input.chat;
  const reviewPlan = reviewChat.plan;
  const userTurns = input.chat.items.filter((i): i is Extract<ChatItem, { kind: "user" }> => i.kind === "user");
  const lastAssistant = [...input.chat.items].reverse().find((i) => i.kind === "assistant");
  const urlChips = lastAssistant && lastAssistant.kind === "assistant"
    ? Array.from(lastAssistant.text.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]).slice(0, 3)
    : [];

  const planComplete =
    input.mode === "plan" && plan.length > 0 && plan.every((e) => e.status === "completed");

  const dashboardSessions = useMemo(
    () =>
      input.allSessions.map((s) => {
        const st = statusFor(s.id);
        const status =
          st === "needs-you" ? "needs-input" : st === "working" ? "running" : "idle";
        return { id: s.id, title: displayTitle(s, input.titles), status } as const;
      }),
    [input.allSessions, statusFor, input.titles],
  );

  const memoryPath = input.rules.find((r) => r.name === "MEMORY.md")?.path;
  const agentsMdPath = input.rules.find((r) => r.name === "AGENTS.md")?.path;
  const permissionContext = {
    mainSessionId: input.sessionId,
    runningMainSessionId: input.runningSessionId,
    splitSessionId: input.extraPaneList[0]?.sessionId ?? null,
    mainBusy: input.busy,
    splitBusy: input.extraBusy,
    extraPanes: input.extraPaneList,
  };
  const panePermissions = selectPanePermissions(input.permissions, permissionContext);
  const mainPermission = panePermissions.main;
  const mainPermissionView = derivePermissionView({ ...permissionContext, request: mainPermission });
  const mainPaneBusy = mainPaneIsBusy({
    busy: input.busy,
    sessionId: input.sessionId,
    runningSessionId: input.runningSessionId,
  });
  const stallText = mainPaneBusy ? stallNote(Date.now() - input.lastActivityAt) : "";
  const takeover = paneComposerTakeover({
    pane: "main",
    pendingPane: mainPermissionView.pane,
    pendingKind: mainPermissionView.kind,
    plan: !!planComplete,
  });
  const layout = heroLayout({ hasMessages: input.chat.items.length > 0, hasCwd: !!input.cwd });
  const hero = {
    ...layout,
    blocked: layout.blocked || shouldBlockIdleComposer(input.connecting, input.ready, !!input.sessionId),
  };
  const turnFiles = lastTurnFiles(reviewChat.items);
  const terminalTools = bashTools(reviewChat.items);
  const reviewTabs = deriveReviewTabs({
    planCount: reviewPlan.length,
    fileCount: turnFiles.length,
    changeCount: input.changes.length,
    contextCount: (input.planFile ? 1 : 0) + input.rules.length,
    hasDetails: !!input.detailsTool,
    hasPreview: !!input.previewPath,
    bashCount: terminalTools.length,
  });
  const reconciledReviewTab = reconcileReviewTab(input.reviewTab, reviewTabs, input.defaultRail);
  const jobs = headerJobs(input.chat.items);
  const catalog = input.subagentCards;
  const goal = input.goalView?.text ?? null;
  const health = agentHealth({ ready: input.ready, connecting: input.connecting, sawExit: input.sawExit });
  const runStatus = deriveRunStatus({
    disconnected: health === "disconnected",
    trustRequired: !!(input.inspect && input.cwd && input.inspect.projectTrusted === false),
    pending: mainPermissionView.statusPending,
    running: mainPaneBusy,
    stalled: !!stallText,
    stallDetail: stallText,
    planComplete,
  });
  const turnStats = turnStatsFromItems(input.chat.items, usage?.output, {
    now: Date.now(),
    live: mainPaneBusy,
  });
  const skillCommands = skillSlashCommands(input.inspect?.skills ?? []);
  const recapText = (current?.lastTurnSummary ?? "").trim();
  const recapKey = recapIdentity(current?.lastTurnSummaryPromptId, recapText);
  const showRecap = shouldShowSessionRecap({ text: recapText, identity: recapKey, dismissed: input.dismissedRecap });
  const openIds = openIdsFromBindings(input.liveBindings());
  const focusedSessionId =
    input.focusedPaneId === MAIN_PANE
      ? input.sessionId
      : input.extraPanes[input.focusedPaneId]?.sessionId ?? input.sessionId;
  const paneCount = leafIds(input.paneTree).length;

  return {
    busyIds,
    statusFor,
    sidebarSections,
    visibleHotkeySessions,
    rewindIndex,
    rewindPreview,
    modelCatalog,
    effortOptions,
    modelLabels,
    current,
    currentTitle,
    sessionModel,
    cwdLocked,
    usage,
    plan,
    reviewPlan,
    userTurns,
    urlChips,
    planComplete,
    dashboardSessions,
    memoryPath,
    agentsMdPath,
    panePermissions,
    mainPermission,
    mainPermissionView,
    mainPaneBusy,
    takeover,
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
    skillCommands,
    recapText,
    recapKey,
    showRecap,
    openIds,
    focusedSessionId,
    paneCount,
  };
}
