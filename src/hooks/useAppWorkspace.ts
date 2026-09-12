import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  deleteSession,
  gitCreateWorktree,
  listSessions,
  moveSessionToCwd,
  pickDirectory,
  restoreTextFile,
  setWorkspace,
  type DoctorInfo,
  type GitStatus,
  type SessionSummary,
  type WebuiState,
} from "../api";
import type { PaneChatStore } from "../lib/pane-chat-store";
import { emptyChat, type ChatItem, type ChatState } from "../lib/chat";
import { canMoveInboxSession, sameCwd } from "../lib/inbox";
import { t, type Locale } from "../lib/i18n";
import { friendlyError } from "../lib/error-copy";
import { shouldMoveComposerFocus } from "../lib/pane-focus";
import {
  MAIN_PANE,
  applyDrop,
  ensureMainLeaf,
  leafIds,
  paneOfSession,
  planPaneRestore,
  type Bindings,
  type PaneNode,
  type ResolvedDrop,
} from "../lib/pane-tree";
import { describePlan, planRevert } from "../lib/checkpoint";
import { worktreeName } from "../lib/git";
import { displayTitle, mergeProjectPaths, setTitleOverride } from "../lib/projects";
import { INBOX_PIN, sessionInLibrary } from "../lib/sidebar-list";
import {
  assignProjectToGroup,
  createProjectGroup,
  deleteProjectGroup,
  nextGroupName,
  pruneProjectGroups,
  renameProjectGroup,
  ungroupProject,
  type ProjectGroupState,
} from "../lib/project-groups";
import {
  catalogSessions,
  dropDiskSession,
  isMissingSessionError,
  omitListedSession,
  rememberCreatedSession,
} from "../lib/session-acp-list";
import { lookupSession, sessionToOpen } from "../lib/live-roster";
import { exportTranscript } from "../lib/session-local";
import { planOpenSession } from "../lib/session-agent";
import { brandSessionList } from "../lib/session-list";
import { menuPosition, type SessionMenuState } from "../SessionMenu";
import { basename } from "../lib/text";
import {
  cancelPending,
  commitPending,
  omitPendingBatch,
  pendingBatchKey,
  queuePending,
  type PendingCommit,
} from "../lib/undo-toast";
import { clearTimeoutRef, scheduleTimeout } from "../lib/timeout-ref";
import type { ToastAction } from "./useToast";
import { putSessionQueue, type QueueState, type SessionQueues } from "../lib/prompt-queue";
import type { AgentId } from "../lib/agent-id";
import type { ExtraPaneState } from "./useAcpSession";
import {
  beginPaneDrag as beginPaneDragAction,
  closePaneLeaf as closePaneLeafAction,
  newChatInFocus as newChatInFocusAction,
  onPaneRatio as onPaneRatioAction,
  splitRight as splitRightAction,
  type PaneTreeActionDeps,
} from "./pane-tree-actions";

/** Window where a "deleted" session is only hidden; the disk delete fires when it lapses. */
export const DELETE_UNDO_MS = 5000;
/** Exit-animation hold before rows/panes unmount; mirrors --dur (160ms) in tokens.css. */
export const LEAVE_ANIM_MS = 160;
/** How long a row keeps its one-shot enter marker so it animates exactly once. */
export const FRESH_ANIM_MS = 1000;

export type AppConfirm = {
  title: string;
  body: string;
  confirmLabel: string;
} & (
  | { kind: "delete-session"; session: SessionSummary }
  | { kind: "delete-sessions"; sessions: SessionSummary[] }
  | { kind: "move-inbox"; sessionId: string; dest: string }
  | { kind: "close-pane"; paneId: string }
  | { kind: "delete-group"; groupId: string }
  | { kind: "remove-project"; path: string }
);

export type AppWorkspaceDeps = {
  locale: Locale;
  cwd: string;
  inboxCwd: string;
  projects: string[];
  pinnedProjects: string[];
  lastWorkspace: string;
  sessions: SessionSummary[];
  inboxSessions: SessionSummary[];
  titles: Record<string, string>;
  projectGroups: ProjectGroupState;
  chat: ChatState;
  paneChatStore: PaneChatStore;
  draft: string;
  busy: boolean;
  atBottom: boolean;
  picking: boolean;
  editingTitleId: string | null;
  sessionId: string | null;
  worktreeBusy: boolean;
  git: GitStatus | null;
  info: DoctorInfo | null;
  persist: (partial: WebuiState) => void;
  showToast: (msg: string, action?: ToastAction) => void;
  setCwd: (cwd: string) => void;
  setLastWorkspace: (path: string) => void;
  setOpenProjects: Dispatch<SetStateAction<Record<string, boolean>>>;
  setProjects: Dispatch<SetStateAction<string[]>>;
  setPinnedProjects: Dispatch<SetStateAction<string[]>>;
  setPicking: (value: boolean) => void;
  setInboxSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setChat: Dispatch<SetStateAction<ChatState>>;
  setDraft: (value: string) => void;
  setAtBottom: (value: boolean) => void;
  setQueue: Dispatch<SetStateAction<QueueState>>;
  setTitles: Dispatch<SetStateAction<Record<string, string>>>;
  setProjectGroups: Dispatch<SetStateAction<ProjectGroupState>>;
  setOpenGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setEditingTitleId: (id: string | null) => void;
  setTitleDraft: (value: string) => void;
  setMenu: Dispatch<SetStateAction<SessionMenuState | null>>;
  setMovePick: Dispatch<SetStateAction<{ id: string; top: number; left: number } | null>>;
  setAppConfirm: Dispatch<SetStateAction<AppConfirm | null>>;
  setWorktreeBusy: (value: boolean) => void;
  setFocusedPaneId: (id: string) => void;
  setPaneTree: Dispatch<SetStateAction<PaneNode>>;
  setExtraPanes: Dispatch<SetStateAction<Record<string, ExtraPaneState>>>;
  setPaneDrag: PaneTreeActionDeps["setPaneDrag"];
  setExpandedIds: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>;
  adoptSession: (id: string | null) => void;
  cancelTurn: (dest?: string) => Promise<void>;
  resumeSession: (s: SessionSummary) => Promise<void>;
  startSession: (workDir?: string) => Promise<void>;
  startNewChat: () => Promise<void>;
  startNewInPane: (paneId: string) => Promise<void>;
  openInPane: (paneId: string, s: SessionSummary) => Promise<void>;
  bindMainAgent: (id: AgentId) => void;
  setSelectedAgentIdPersist: (id: AgentId) => void;
  refreshGit: () => Promise<void>;
  projectsRef: MutableRefObject<string[]>;
  acpListedRef: MutableRefObject<Partial<Record<AgentId, SessionSummary[]>>>;
  diskSessionsRef: MutableRefObject<SessionSummary[]>;
  allSessionsRef: MutableRefObject<SessionSummary[]>;
  sessionIdRef: MutableRefObject<string | null>;
  runningSessionIdRef: MutableRefObject<string | null>;
  extraPanesRef: MutableRefObject<Record<string, ExtraPaneState>>;
  paneTreeRef: MutableRefObject<PaneNode>;
  focusedPaneIdRef: MutableRefObject<string>;
  queueRef: MutableRefObject<QueueState>;
  sessionQueuesRef: MutableRefObject<SessionQueues>;
  composerRef: MutableRefObject<{ focus: () => void } | null>;
  extraComposerRefs: MutableRefObject<Record<string, { focus: () => void } | null>>;
  focusedPermissionPaneRef: MutableRefObject<string | null>;
  workColRef: MutableRefObject<{ getBoundingClientRect(): DOMRect } | null>;
  mainAgentIdRef: MutableRefObject<AgentId>;
  selectedAgentId: AgentId;
};

export function useAppWorkspace(deps: AppWorkspaceDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const createdSessionsRef = useRef<SessionSummary[]>([]);
  const pendingDeleteRef = useRef<PendingCommit<SessionSummary[]> | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitlesRef = useRef<Record<string, string>>({});
  const [leavingPanes, setLeavingPanes] = useState<ReadonlySet<string>>(new Set());
  const [leavingSessions, setLeavingSessions] = useState<ReadonlySet<string>>(new Set());
  const [freshSessions, setFreshSessions] = useState<ReadonlySet<string>>(new Set());
  const paneLeaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Deferred delete commits keyed by their timer so unmount can flush them.
  const sessionLeaveRef = useRef<Map<ReturnType<typeof setTimeout>, () => void>>(new Map());
  const freshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function flagIds(setter: Dispatch<SetStateAction<ReadonlySet<string>>>, ids: string[], on: boolean) {
    setter((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ids) {
        if (on && !next.has(id)) {
          next.add(id);
          changed = true;
        } else if (!on && next.delete(id)) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  /** One-shot enter marker; the timer drops it so the row animates once. */
  function markFreshSession(id: string) {
    flagIds(setFreshSessions, [id], true);
    const timers = freshTimersRef.current;
    const prev = timers.get(id);
    if (prev != null) clearTimeout(prev);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        flagIds(setFreshSessions, [id], false);
      }, FRESH_ANIM_MS),
    );
  }

  function findSessionById(id: string): SessionSummary | null {
    return lookupSession(id, depsRef.current.allSessionsRef.current);
  }

  function currentSession(): SessionSummary | null {
    const d = depsRef.current;
    return d.sessionId
      ? d.sessions.find((s) => s.id === d.sessionId) ?? d.inboxSessions.find((s) => s.id === d.sessionId) ?? null
      : null;
  }

  function liveBindings(): Bindings {
    const d = depsRef.current;
    const b: Bindings = { [MAIN_PANE]: d.sessionIdRef.current };
    for (const [id, pane] of Object.entries(d.extraPanesRef.current)) b[id] = pane.sessionId;
    return b;
  }

  function applySessionUnion(disk: SessionSummary[], inbox: string, projectPaths: string[] = depsRef.current.projectsRef.current) {
    const d = depsRef.current;
    d.diskSessionsRef.current = disk;
    const { rows, created } = catalogSessions({
      disk,
      acp: Object.values(d.acpListedRef.current).flat(),
      created: createdSessionsRef.current,
    });
    createdSessionsRef.current = created;
    const all = rows.filter((s) => sessionInLibrary(s.cwd, projectPaths, inbox));
    const visible = omitPendingBatch(all, pendingDeleteRef.current);
    d.setInboxSessions(inbox ? visible.filter((s) => sameCwd(s.cwd, inbox)) : []);
    d.setSessions(inbox ? visible.filter((s) => !sameCwd(s.cwd, inbox)) : visible);
  }

  function onAcpSessionList(agentId: AgentId, rows: SessionSummary[]) {
    const d = depsRef.current;
    d.acpListedRef.current = { ...d.acpListedRef.current, [agentId]: rows };
    applySessionUnion(d.diskSessionsRef.current, d.inboxCwd);
  }

  function onSessionCreated(row: SessionSummary) {
    createdSessionsRef.current = rememberCreatedSession(createdSessionsRef.current, row);
    markFreshSession(row.id);
    applySessionUnion(depsRef.current.diskSessionsRef.current, depsRef.current.inboxCwd);
  }

  async function refreshAllSessions(inbox = depsRef.current.inboxCwd) {
    const d = depsRef.current;
    try {
      applySessionUnion(brandSessionList(await listSessions(null)), inbox);
    } catch {
      d.setInboxSessions([]);
    }
  }

  async function refreshInbox(path = depsRef.current.inboxCwd) {
    await refreshAllSessions(path);
  }

  function focusPane(paneId: string) {
    const d = depsRef.current;
    const stealComposer = shouldMoveComposerFocus(d.focusedPaneIdRef.current, paneId);
    d.setFocusedPaneId(paneId);
    d.focusedPermissionPaneRef.current = paneId;
    if (!stealComposer) return;
    window.setTimeout(() => {
      if (paneId === MAIN_PANE) d.composerRef.current?.focus();
      else d.extraComposerRefs.current[paneId]?.focus();
    }, 0);
  }

  function snapshotMain(): ExtraPaneState | null {
    const d = depsRef.current;
    if (!d.sessionIdRef.current) return null;
    return {
      sessionId: d.sessionIdRef.current,
      cwd: d.cwd,
      chat: d.paneChatStore.getMain().chat,
      draft: d.draft,
      busy: d.paneChatStore.getMain().busy,
      atBottom: d.atBottom,
      queue: d.queueRef.current,
      agentId: d.mainAgentIdRef.current,
    };
  }

  function applyMainFromExtra(extra: ExtraPaneState) {
    const d = depsRef.current;
    const paneId = Object.entries(d.extraPanesRef.current).find(([, pane]) => pane.sessionId === extra.sessionId)?.[0];
    const live = paneId ? d.paneChatStore.getExtra(paneId) : undefined;
    d.adoptSession(extra.sessionId);
    d.setChat(live?.chat ?? extra.chat);
    d.setCwd(extra.cwd);
    d.setDraft(extra.draft);
    d.setAtBottom(extra.atBottom);
    d.setQueue(extra.queue);
    d.queueRef.current = extra.queue;
    d.sessionQueuesRef.current = putSessionQueue(d.sessionQueuesRef.current, extra.sessionId, extra.queue);
    d.bindMainAgent(extra.agentId);
    d.setSelectedAgentIdPersist(extra.agentId);
  }

  async function commitDrop(drop: ResolvedDrop) {
    const d = depsRef.current;
    const tree = d.paneTreeRef.current;
    const bindings = liveBindings();
    const applied = applyDrop(tree, bindings, drop);
    if (!applied) return;
    const ensured = ensureMainLeaf(applied.tree, applied.bindings);
    const snap = snapshotMain();
    const nextExtras: Record<string, ExtraPaneState> = {};
    const needsLoad: { paneId: string; sessionId: string }[] = [];
    for (const [paneId, sid] of Object.entries(ensured.bindings)) {
      if (!sid || paneId === MAIN_PANE) continue;
      const existing = Object.values(d.extraPanesRef.current).find((p) => p.sessionId === sid);
      if (existing) nextExtras[paneId] = existing;
      else if (snap && snap.sessionId === sid) nextExtras[paneId] = snap;
      else needsLoad.push({ paneId, sessionId: sid });
    }
    const mainSid = ensured.bindings[MAIN_PANE] ?? null;
    if (mainSid && mainSid !== d.sessionIdRef.current) {
      const fromExtra = Object.values(d.extraPanesRef.current).find((p) => p.sessionId === mainSid);
      if (fromExtra) applyMainFromExtra(fromExtra);
      else {
        const s = findSessionById(mainSid);
        if (s) await d.resumeSession(s);
      }
    } else if (!mainSid && d.sessionIdRef.current) {
      d.adoptSession(null);
      d.setChat(emptyChat());
    }
    d.setPaneTree(ensured.tree);
    d.setExtraPanes(nextExtras);
    const nextFocus = ensured.retargetFrom === applied.focus
      ? MAIN_PANE
      : (leafIds(ensured.tree).includes(applied.focus) ? applied.focus : MAIN_PANE);
    focusPane(nextFocus);
    for (const item of needsLoad) {
      const s = findSessionById(item.sessionId);
      if (s) await d.openInPane(item.paneId, s);
    }
  }

  function paneTreeDeps(): PaneTreeActionDeps {
    const d = depsRef.current;
    return {
      paneTreeRef: d.paneTreeRef,
      extraPanesRef: d.extraPanesRef,
      sessionIdRef: d.sessionIdRef,
      focusedPaneIdRef: d.focusedPaneIdRef,
      allSessionsRef: d.allSessionsRef,
      workColRef: d.workColRef,
      titles: d.titles,
      locale: d.locale,
      setPaneTree: d.setPaneTree,
      setExtraPanes: d.setExtraPanes,
      setPaneDrag: d.setPaneDrag,
      showToast: d.showToast,
      focusPane,
      applyMainFromExtra,
      liveBindings,
      commitDrop,
      startNewInPane: d.startNewInPane,
      startNewChat: d.startNewChat,
    };
  }

  async function selectProject(path: string) {
    const d = depsRef.current;
    const last = path === INBOX_PIN || (d.inboxCwd && sameCwd(path, d.inboxCwd)) ? INBOX_PIN : path;
    d.setLastWorkspace(last);
    d.persist({ lastWorkspace: last });
    d.setCwd(path);
    d.setOpenProjects((m) => ({ ...m, [path]: true }));
    const current = currentSession();
    if (current && !sameCwd(current.cwd, path)) {
      d.adoptSession(null);
      d.setChat(emptyChat());
    }
    try {
      await setWorkspace(path);
    } catch (e) {
      d.showToast(friendlyError(e));
    }
  }

  async function addProject() {
    const d = depsRef.current;
    if (d.picking) return;
    d.setPicking(true);
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      if (dir === "/" || dir === d.info?.grokHome || dir === (d.info?.grokHome ? undefined : "")) {
        d.showToast(t(d.locale, "toast.pickProjectNotRoot"));
        return;
      }
      const next = mergeProjectPaths([...d.projects, dir], []);
      d.setProjects(next);
      d.persist({ projects: next, manualProjects: true });
      applySessionUnion(d.diskSessionsRef.current, d.inboxCwd, next);
      await selectProject(dir);
    } catch (e) {
      d.showToast(friendlyError(e));
    } finally {
      d.setPicking(false);
    }
  }

  async function switchWorkdir(path: string) {
    const d = depsRef.current;
    const current = currentSession();
    const bound = current && d.inboxCwd ? !sameCwd(current.cwd, d.inboxCwd) : !!(current && current.cwd);
    const hasTurn = d.chat.items.some((i) => i.kind === "user" || i.kind === "assistant");
    if (bound && hasTurn) {
      d.showToast(t(d.locale, "toast.cwdLockedAfterTurn"));
      return;
    }
    d.setCwd(path);
    if (current && !sameCwd(current.cwd, path)) {
      d.adoptSession(null);
      d.setChat(emptyChat());
    }
    try {
      await setWorkspace(path);
    } catch (e) {
      d.showToast(friendlyError(e));
    }
  }

  async function removeSession(s: SessionSummary) {
    const d = depsRef.current;
    d.setAppConfirm({
      title: t(d.locale, "confirm.deleteSessionTitle"),
      body: t(d.locale, "confirm.deleteSessionBody", { title: displayTitle(s, d.titles) }),
      confirmLabel: t(d.locale, "hub.delete"),
      kind: "delete-session",
      session: s,
    });
  }

  async function deleteSessionRows(rows: SessionSummary[]) {
    const d = depsRef.current;
    for (const s of rows) {
      try {
        await deleteSession(s.id, s.dir);
      } catch (e) {
        if (!isMissingSessionError(e)) d.showToast(friendlyError(e));
      }
    }
  }

  /** Remove rows from every list source and persist title cleanup, before disk delete lands. */
  function optimisticRemoveSessions(batch: SessionSummary[]) {
    const d = depsRef.current;
    let disk = d.diskSessionsRef.current;
    let titles = d.titles;
    const captured: Record<string, string> = {};
    for (const s of batch) {
      d.acpListedRef.current = omitListedSession(d.acpListedRef.current, s.id);
      createdSessionsRef.current = dropDiskSession(createdSessionsRef.current, s.id);
      const cur = titles[s.id];
      if (cur?.trim()) captured[s.id] = cur;
      titles = setTitleOverride(titles, s.id, "");
      if (d.editingTitleId === s.id) d.setEditingTitleId(null);
      if (d.sessionId === s.id) {
        d.adoptSession(null);
        d.setChat(emptyChat());
      }
      const extraId = Object.entries(d.extraPanesRef.current).find(([, pane]) => pane.sessionId === s.id)?.[0];
      if (extraId) closePaneLeaf(extraId);
      disk = dropDiskSession(disk, s.id);
    }
    pendingTitlesRef.current = captured;
    if (titles !== d.titles) {
      d.setTitles(titles);
      d.persist({ titles });
    }
    d.setMenu(null);
    applySessionUnion(disk, d.inboxCwd);
  }

  function undoSessionDelete(key: string) {
    const d = depsRef.current;
    const { pending, restored } = cancelPending(pendingDeleteRef.current, key);
    pendingDeleteRef.current = pending;
    if (!restored) return;
    clearTimeoutRef(pendingDeleteTimerRef);
    const saved = pendingTitlesRef.current;
    pendingTitlesRef.current = {};
    let titles = d.titles;
    for (const s of restored) {
      const prev = saved[s.id];
      if (prev) titles = setTitleOverride(titles, s.id, prev);
    }
    if (titles !== d.titles) {
      d.setTitles(titles);
      d.persist({ titles });
    }
    for (const s of restored) {
      createdSessionsRef.current = rememberCreatedSession(createdSessionsRef.current, s);
      markFreshSession(s.id);
    }
    applySessionUnion(d.diskSessionsRef.current, d.inboxCwd);
    void refreshAllSessions();
  }

  function queueSessionDelete(batch: SessionSummary[], message: string) {
    if (batch.length === 0) return;
    const ids = batch.map((s) => s.id);
    flagIds(setLeavingSessions, ids, true);
    // The optimistic removal + undo toast land once the exit animation ends.
    const commit = () => {
      const d = depsRef.current;
      flagIds(setLeavingSessions, ids, false);
      optimisticRemoveSessions(batch);
      const key = batch.length === 1 ? batch[0].id : pendingBatchKey(batch);
      const { pending, displaced } = queuePending(pendingDeleteRef.current, { key, payload: batch });
      pendingDeleteRef.current = pending;
      if (displaced) void deleteSessionRows(displaced);
      scheduleTimeout(pendingDeleteTimerRef, () => {
        const done = commitPending(pendingDeleteRef.current, key);
        pendingDeleteRef.current = done.pending;
        if (!done.committed) return;
        pendingTitlesRef.current = {};
        void deleteSessionRows(done.committed);
      }, DELETE_UNDO_MS);
      d.showToast(message, {
        actionLabel: t(d.locale, "toast.undo"),
        onAction: () => undoSessionDelete(key),
      });
    };
    const handle = setTimeout(() => {
      sessionLeaveRef.current.delete(handle);
      commit();
    }, LEAVE_ANIM_MS);
    sessionLeaveRef.current.set(handle, commit);
  }

  async function commitRemoveSession(s: SessionSummary) {
    queueSessionDelete([s], t(depsRef.current.locale, "toast.deleted"));
  }

  function removeSessions(ids: string[]) {
    const d = depsRef.current;
    const idSet = new Set(ids);
    const rows = ids
      .map((id) => findSessionById(id))
      .filter((s): s is SessionSummary => !!s && (!s.parentSessionId || !idSet.has(s.parentSessionId)));
    if (rows.length === 0) return;
    if (rows.length === 1) {
      void removeSession(rows[0]);
      return;
    }
    d.setAppConfirm({
      title: t(d.locale, "confirm.deleteSessionTitle"),
      body: t(d.locale, "confirm.deleteSessionsBody", { n: rows.length }),
      confirmLabel: t(d.locale, "hub.delete"),
      kind: "delete-sessions",
      sessions: rows,
    });
  }

  useEffect(
    () => () => {
      // Flush deletes still inside their exit window so they commit instead
      // of stranding rows the user already confirmed.
      for (const [handle, commit] of sessionLeaveRef.current) {
        clearTimeout(handle);
        commit();
      }
      sessionLeaveRef.current.clear();
      clearTimeoutRef(pendingDeleteTimerRef);
      const { committed } = commitPending(pendingDeleteRef.current);
      pendingDeleteRef.current = null;
      if (committed) void deleteSessionRows(committed);
      for (const handle of paneLeaveTimersRef.current.values()) clearTimeout(handle);
      paneLeaveTimersRef.current.clear();
      for (const handle of freshTimersRef.current.values()) clearTimeout(handle);
      freshTimersRef.current.clear();
    },
    [],
  );

  async function moveInboxToProject(sessionId: string, dest: string) {
    const d = depsRef.current;
    if (!d.inboxCwd) return;
    const err = canMoveInboxSession(
      d.inboxSessions.find((s) => s.id === sessionId)?.cwd || d.inboxCwd,
      dest,
      d.inboxCwd,
    );
    if (err) {
      d.showToast(err);
      return;
    }
    d.setAppConfirm({
      title: t(d.locale, "confirm.moveInboxTitle"),
      body: t(d.locale, "confirm.moveInboxBody"),
      confirmLabel: t(d.locale, "confirm.moveInbox"),
      kind: "move-inbox",
      sessionId,
      dest,
    });
  }

  async function commitMoveInbox(sessionId: string, dest: string) {
    const d = depsRef.current;
    d.setMovePick(null);
    try {
      if (d.runningSessionIdRef.current === sessionId && d.busy) {
        await d.cancelTurn();
      }
      if (d.sessionIdRef.current === sessionId) {
        d.adoptSession(null);
        d.setChat(emptyChat());
      }
      const row = await moveSessionToCwd(sessionId, dest, d.inboxCwd);
      await refreshInbox();
      await selectProject(dest);
      await d.resumeSession(row);
      d.showToast(t(d.locale, "toast.movedToProject"));
    } catch (e) {
      d.showToast(friendlyError(e));
    }
  }

  function openMenu(kind: "header" | "row", id: string, el: HTMLElement, point?: { clientX: number; clientY: number }) {
    const pos = menuPosition(el, point);
    depsRef.current.setMenu({ kind, id, ...pos });
  }

  function beginEditTitle(id?: string | null) {
    const d = depsRef.current;
    const sid = id || d.sessionIdRef.current;
    if (!sid) return;
    const s = findSessionById(sid);
    d.setMenu(null);
    d.setTitleDraft(s ? displayTitle(s, d.titles) : "");
    d.setEditingTitleId(sid);
  }

  function cancelEditTitle() {
    const d = depsRef.current;
    d.setEditingTitleId(null);
    d.setTitleDraft("");
  }

  function commitTitle(raw: string) {
    const d = depsRef.current;
    const id = d.editingTitleId;
    if (!id) {
      cancelEditTitle();
      return;
    }
    const nextTitle = raw.trim();
    if (nextTitle === "--auto") {
      cancelEditTitle();
      d.showToast(t(d.locale, "toast.badAutoTitle"));
      return;
    }
    if (!nextTitle) {
      cancelEditTitle();
      return;
    }
    const next = setTitleOverride(d.titles, id, nextTitle);
    d.setTitles(next);
    d.persist({ titles: next });
    d.setEditingTitleId(null);
  }

  function restoreGenerated(id: string) {
    const d = depsRef.current;
    const next = setTitleOverride(d.titles, id, "");
    d.setTitles(next);
    d.persist({ titles: next });
    d.setMenu(null);
  }

  async function openSession(s: SessionSummary) {
    const d = depsRef.current;
    s = sessionToOpen(s, d.allSessionsRef.current);
    if (s.parentSessionId) {
      const parent = s.parentSessionId;
      d.setCollapsedIds((prev) => {
        if (!prev.has(parent)) return prev;
        const next = new Set(prev);
        next.delete(parent);
        return next;
      });
      d.setExpandedIds((prev) => {
        if (prev.has(parent)) return prev;
        return new Set(prev).add(parent);
      });
    }
    const existing = paneOfSession(liveBindings(), s.id);
    const planned = planOpenSession({
      session: s,
      alreadyBound: !!existing,
      currentChip: d.selectedAgentId,
    });
    d.setSelectedAgentIdPersist(planned.selectedAfterOpen);
    if (existing) {
      d.bindMainAgent(planned.selectedAfterOpen);
      focusPane(existing);
      return;
    }
    await d.openInPane(d.focusedPaneIdRef.current, s);
    focusPane(d.focusedPaneIdRef.current);
  }

  async function splitRight(s: SessionSummary) {
    await splitRightAction(paneTreeDeps(), s);
  }

  function closePaneLeaf(paneId: string) {
    const ids = leafIds(depsRef.current.paneTreeRef.current);
    // Hold the leaf for one exit window (.pane-leaving, ~--dur) before the
    // tree drops it, but only when the close will actually remove a leaf.
    if (ids.length > 1 && ids.includes(paneId)) {
      flagIds(setLeavingPanes, [paneId], true);
      const timers = paneLeaveTimersRef.current;
      const prev = timers.get(paneId);
      if (prev != null) clearTimeout(prev);
      timers.set(
        paneId,
        setTimeout(() => {
          timers.delete(paneId);
          flagIds(setLeavingPanes, [paneId], false);
          closePaneLeafAction(paneTreeDeps(), paneId);
        }, LEAVE_ANIM_MS),
      );
      return;
    }
    closePaneLeafAction(paneTreeDeps(), paneId);
  }

  async function newChatInFocus() {
    await newChatInFocusAction(paneTreeDeps());
  }

  function onPaneRatio(splitId: string, ratio: number) {
    onPaneRatioAction(paneTreeDeps(), splitId, ratio);
  }

  function beginPaneDrag(e: { button: number; clientX: number; clientY: number }, s: SessionSummary) {
    beginPaneDragAction(paneTreeDeps(), e, s);
  }

  function onExtraDraftChange(paneId: string, value: string) {
    depsRef.current.setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      return { ...prev, [paneId]: { ...cur, draft: value } };
    });
  }

  function onExtraAtBottom(paneId: string, value: boolean) {
    depsRef.current.setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur || cur.atBottom === value) return prev;
      return { ...prev, [paneId]: { ...cur, atBottom: value } };
    });
  }

  function onExtraQueue(paneId: string, update: (queue: QueueState) => QueueState) {
    depsRef.current.setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      return { ...prev, [paneId]: { ...cur, queue: update(cur.queue) } };
    });
  }

  function copyAllConversation(items: ChatItem[]) {
    const d = depsRef.current;
    const text = exportTranscript(items);
    void navigator.clipboard.writeText(text).then(() => d.showToast(t(d.locale, "toast.copiedAll")));
  }

  async function switchWorktree(path: string) {
    if (!path) return;
    await selectProject(path);
  }

  async function newWorktreeSession() {
    const d = depsRef.current;
    if (!d.cwd || !d.git?.isRepo || d.worktreeBusy) return;
    const current = currentSession();
    const base = current ? displayTitle(current, d.titles) : "";
    const name = worktreeName(base);
    d.setWorktreeBusy(true);
    try {
      const dir = await gitCreateWorktree(d.cwd, name);
      const next = mergeProjectPaths([...d.projects, dir], []);
      d.setProjects(next);
      d.persist({ projects: next, manualProjects: true });
      applySessionUnion(d.diskSessionsRef.current, d.inboxCwd, next);
      await selectProject(dir);
      await d.startSession(dir);
      d.showToast(t(d.locale, "toast.newWorktreeSession", { name: basename(dir) }));
    } catch (e) {
      d.showToast(friendlyError(e));
    } finally {
      d.setWorktreeBusy(false);
    }
  }

  async function applyRewind(index: number) {
    const d = depsRef.current;
    const root = d.cwd || d.inboxCwd;
    if (!root) return;
    const plan = planRevert(d.chat.items, index);
    if (plan.steps.length === 0) {
      d.showToast(describePlan(plan));
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
    await d.refreshGit();
    d.showToast(
      failed.length === 0
        ? t(d.locale, "toast.restoredFiles", { n: ok })
        : t(d.locale, "toast.restoredPartial", { ok, failed: failed.length, name: basename(failed[0]) }),
    );
  }

  function toggleExpand(id: string, currentlyOpen: boolean) {
    const d = depsRef.current;
    if (currentlyOpen) {
      d.setExpandedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      d.setCollapsedIds((s) => new Set(s).add(id));
    } else {
      d.setCollapsedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      d.setExpandedIds((s) => new Set(s).add(id));
    }
  }

  function commitProjectGroups(next: ProjectGroupState) {
    const d = depsRef.current;
    const pruned = pruneProjectGroups(next, d.projectsRef.current);
    d.setProjectGroups(pruned);
    d.persist({ projectGroups: pruned });
  }

  function createNamedGroup(name?: string): { id: string; name: string } {
    const d = depsRef.current;
    const label = (name ?? "").trim() || nextGroupName(d.projectGroups.groups.map((g) => g.name));
    const made = createProjectGroup(d.projectGroups, label);
    commitProjectGroups(made.state);
    d.setOpenGroups((m) => ({ ...m, [made.id]: true }));
    return { id: made.id, name: label };
  }

  function createGroupForProject(path: string): { id: string; name: string } {
    const d = depsRef.current;
    const label = nextGroupName(d.projectGroups.groups.map((g) => g.name));
    const made = createProjectGroup(d.projectGroups, label);
    commitProjectGroups(assignProjectToGroup(made.state, path, made.id));
    d.setOpenGroups((m) => ({ ...m, [made.id]: true }));
    return { id: made.id, name: label };
  }

  function moveProjectToGroup(path: string, groupId: string | null) {
    const d = depsRef.current;
    commitProjectGroups(groupId ? assignProjectToGroup(d.projectGroups, path, groupId) : ungroupProject(d.projectGroups, path));
  }

  function renameNamedGroup(id: string, name: string) {
    commitProjectGroups(renameProjectGroup(depsRef.current.projectGroups, id, name));
  }

  function requestDeleteGroup(id: string) {
    const d = depsRef.current;
    const group = d.projectGroups.groups.find((g) => g.id === id);
    if (!group) return;
    d.setAppConfirm({
      title: t(d.locale, "confirm.deleteGroupTitle"),
      body: t(d.locale, "confirm.deleteGroupBody", { name: group.name }),
      confirmLabel: t(d.locale, "sidebar.deleteGroup"),
      kind: "delete-group",
      groupId: id,
    });
  }

  function requestRemoveProject(path: string) {
    const d = depsRef.current;
    if (path === INBOX_PIN) return;
    d.setAppConfirm({
      title: t(d.locale, "confirm.removeProjectTitle"),
      body: t(d.locale, "confirm.removeProjectBody", { name: basename(path) }),
      confirmLabel: t(d.locale, "hub.remove"),
      kind: "remove-project",
      path,
    });
  }

  /** Drop the project row only — the folder and its sessions stay on disk. */
  function commitRemoveProject(path: string) {
    const d = depsRef.current;
    const next = mergeProjectPaths(d.projectsRef.current.filter((p) => !sameCwd(p, path)), []);
    const pinnedNext = d.pinnedProjects.filter((p) => !sameCwd(p, path));
    const groupsNext = pruneProjectGroups(d.projectGroups, next);
    d.setProjects(next);
    d.setPinnedProjects(pinnedNext);
    d.setProjectGroups(groupsNext);
    d.setOpenProjects((m) => {
      if (!(path in m)) return m;
      const out = { ...m };
      delete out[path];
      return out;
    });
    const last = sameCwd(d.lastWorkspace, path) ? "" : d.lastWorkspace;
    if (last !== d.lastWorkspace) d.setLastWorkspace(last);
    d.persist({
      projects: next,
      pinnedProjects: pinnedNext,
      projectGroups: groupsNext,
      lastWorkspace: last,
      manualProjects: true,
    });
    applySessionUnion(d.diskSessionsRef.current, d.inboxCwd, next);
  }

  /**
   * Rebind a persisted pane layout after the session list lands. Dead leaves are
   * closed by planPaneRestore; live extras re-open via openInPane, and the main
   * leaf resumes its session when nothing newer claimed it.
   */
  async function restorePaneSessions(
    tree: PaneNode,
    bindings: Bindings,
    sessions: SessionSummary[],
  ): Promise<void> {
    const d = depsRef.current;
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const plan = planPaneRestore(tree, bindings, new Set(byId.keys()));
    d.setPaneTree(plan.tree);
    const keep = new Set(leafIds(plan.tree));
    d.setExtraPanes((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    if (plan.mainSessionId && plan.mainSessionId !== d.sessionIdRef.current) {
      const s = byId.get(plan.mainSessionId);
      if (s) await d.resumeSession(s);
    }
    for (const { paneId, sessionId } of plan.open) {
      if (!keep.has(paneId) || d.extraPanesRef.current[paneId]) continue;
      if (sessionId === d.sessionIdRef.current) continue;
      const s = byId.get(sessionId);
      if (s) await d.openInPane(paneId, s);
    }
  }

  function confirmAppModal(pending: AppConfirm | null) {
    if (!pending) return;
    if (pending.kind === "delete-session") void commitRemoveSession(pending.session);
    else if (pending.kind === "delete-sessions")
      queueSessionDelete(pending.sessions, t(depsRef.current.locale, "toast.deletedCount", { n: pending.sessions.length }));
    else if (pending.kind === "move-inbox") void commitMoveInbox(pending.sessionId, pending.dest);
    else if (pending.kind === "remove-project") commitRemoveProject(pending.path);
    else if (pending.kind === "delete-group") {
      commitProjectGroups(deleteProjectGroup(depsRef.current.projectGroups, pending.groupId));
    } else closePaneLeaf(pending.paneId);
  }

  return {
    findSessionById,
    liveBindings,
    applySessionUnion,
    onAcpSessionList,
    onSessionCreated,
    refreshAllSessions,
    refreshInbox,
    focusPane,
    selectProject,
    addProject,
    switchWorkdir,
    removeSession,
    removeSessions,
    commitRemoveSession,
    moveInboxToProject,
    commitMoveInbox,
    openMenu,
    beginEditTitle,
    cancelEditTitle,
    commitTitle,
    restoreGenerated,
    openSession,
    splitRight,
    closePaneLeaf,
    newChatInFocus,
    onPaneRatio,
    beginPaneDrag,
    onExtraDraftChange,
    onExtraAtBottom,
    onExtraQueue,
    copyAllConversation,
    switchWorktree,
    newWorktreeSession,
    applyRewind,
    toggleExpand,
    confirmAppModal,
    currentSession,
    createNamedGroup,
    createGroupForProject,
    moveProjectToGroup,
    renameNamedGroup,
    requestDeleteGroup,
    requestRemoveProject,
    commitRemoveProject,
    restorePaneSessions,
    leavingPanes,
    leavingSessions,
    freshSessions,
  };
}
