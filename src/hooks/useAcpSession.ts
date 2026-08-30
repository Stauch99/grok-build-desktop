import { useEffect, useRef, useState } from "react";
import {
  ensureInbox,
  nextRpcId,
  onAcpMessage,
  onAcpStderr,
  onAgentExit,
  readSessionUpdates,
  readSessionUsage,
  sendRaw,
  setWorkspace,
  startAgent,
  type JsonRpc,
  type SessionSummary,
  type WebuiState,
} from "../api";
import {
  afterByteFor,
  applySessionPage,
  emptyChat,
  shouldKeepSessionUpdate,
  shouldClearBusyOnSettledChat,
  type ChatState,
  type SessionUpdateCursor,
} from "../lib/chat";
import {
  foldSessionUpdates,
  scheduleSessionUpdateFlush,
  shouldClearBusyOnSessionUpdate,
  shouldFlushSessionUpdateNow,
} from "../lib/session-update-batch";
import { filterCommands, type CommandDef } from "../lib/commands";
import { sameCwd } from "../lib/inbox";
import { shouldDropAcpEvent } from "../lib/acp-host";
import type { AgentId } from "../lib/agent-id";
import type { Mode } from "../lib/mode";
import { enqueue, emptyQueue, type QueueState } from "../lib/prompt-queue";
import { agentSendBlockReason, type AgentDoctor } from "../lib/agent-doctor";
import { INBOX_PIN, lastWorkspaceAfterOpen, projectForSession, resolveLastWorkspace, resumeWorkspaceCwd } from "../lib/sidebar-list";
import { getDraft, setDraft as writeDraft } from "../lib/session-drafts";
import { agentIdForPaneDest, agentIdOfSession, planOpenSession, selectedAgentAfterOpen, sessionCancelNotification, sessionNewMeta, shouldCancelAcpOnNewChat, shouldCreateAcpSessionOnNewChat, shouldUnbindBeforeNewChat } from "../lib/session-agent";
import { clearUnread, markUnread, type UnreadMap } from "../lib/session-status";
import {
  afterInitializeFetchSessionList,
  flagsAfterWarmup,
  initializeTimeoutMs,
  shouldAdoptInFlightBoot,
  shouldStartWarmup,
} from "../lib/agent-warmup";
import { asRecord, shouldClearBusyOnAgentStderr, surfaceStderr } from "../lib/text";
import { resolveOutgoingPrompt } from "../lib/memory-inject";
import { chatHasPromptHistory, dismissInjected, markInjected, markStarted } from "../lib/memory-inject-session";
import { isDreamSession } from "../lib/memory-dream-acp";
import { maybeFetchAcpSessionList } from "../lib/session-acp-list";

const MAIN_PANE = "main";
const agentBoots: Partial<Record<AgentId, Promise<void>>> = {};

export function sessionIdFromNewResult(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error("session/new 没有返回 sessionId");
  return sid;
}

export function isPromptStopResult(result: unknown): boolean {
  return !!result && typeof result === "object" && "stopReason" in result;
}

export function shouldClearBusyOnPromptResult(result: unknown, hadLiveWaiter: boolean, method?: string): boolean {
  if (!hadLiveWaiter || result == null) return false;
  if (method === "session/prompt") return true;
  return isPromptStopResult(result);
}

export function shouldClearBusyOnPromptError(error: unknown, hadLiveWaiter: boolean): boolean {
  return hadLiveWaiter && error != null;
}

export type SessionUpdateDest = string | "drop";

export function sessionUpdateDest(
  openBySession: Readonly<Record<string, string>>,
  updateSessionId: string | null,
  fallbackPane = "main",
): SessionUpdateDest {
  if (isDreamSession(updateSessionId)) return "drop";
  if (updateSessionId && openBySession[updateSessionId]) return openBySession[updateSessionId];
  const fallbackSession =
    Object.entries(openBySession).find(([, pane]) => pane === fallbackPane)?.[0] ?? null;
  if (!shouldKeepSessionUpdate(fallbackSession, updateSessionId)) return "drop";
  return fallbackPane;
}

export function withEchoedUser(chat: ChatState, text: string, idPrefix: string, at: number): ChatState {
  return {
    ...chat,
    items: [...chat.items, { kind: "user", id: `${idPrefix}-${chat.nextId}`, text, at }],
    nextId: chat.nextId + 1,
  };
}

export function withPromptFail(chat: ChatState, text: string, at: number): ChatState {
  const last = chat.items[chat.items.length - 1];
  if (last?.kind === "tool" && last.status === "failed" && last.detail === text) return chat;
  return {
    ...chat,
    items: [
      ...chat.items,
      {
        kind: "tool",
        id: `fail-${chat.nextId}`,
        title: "请求失败",
        status: "failed",
        detail: text,
        at,
      },
    ],
    nextId: chat.nextId + 1,
  };
}

export function isAbandonedPromptError(e: unknown): boolean {
  return e instanceof Error && e.message === "prompt-abandoned";
}

export function abandonPendingForDest(
  pendingRpc: Map<number, { reject: (e: Error) => void }>,
  pendingDest: Map<number, string>,
  dest: string,
): void {
  for (const [id, pane] of [...pendingDest.entries()]) {
    if (pane !== dest) continue;
    pendingRpc.get(id)?.reject(new Error("prompt-abandoned"));
    pendingRpc.delete(id);
    pendingDest.delete(id);
  }
}

export function ignoreAcpHistoryDuringResume(diskRowCount: number): boolean {
  return diskRowCount > 0;
}

export function targetAgentId(requested: AgentId | undefined, chip: AgentId): AgentId {
  return requested ?? chip;
}

export function isAgentReady(
  ready: Readonly<Partial<Record<AgentId, boolean>>>,
  agentId: AgentId,
): boolean {
  return ready[agentId] === true;
}

export function openSessionAgent(
  session: { agentId?: string | null },
  chip: AgentId,
): { agentId: AgentId; selectedAfterOpen: AgentId } {
  const agentId = agentIdOfSession(session);
  return { agentId, selectedAfterOpen: selectedAgentAfterOpen(agentId, chip) };
}

export async function resumeOnSessionAgent(args: {
  session: { id: string; cwd?: string; agentId?: string | null };
  chip: AgentId;
  startAgent: (id: AgentId) => Promise<unknown>;
  sendRaw: (payload: unknown, agentId: AgentId) => Promise<unknown>;
  alreadyReady: (id: AgentId) => boolean;
}): Promise<AgentId> {
  const { agentId } = openSessionAgent(args.session, args.chip);
  if (!args.alreadyReady(agentId)) await args.startAgent(agentId);
  const params = { sessionId: args.session.id, cwd: args.session.cwd || undefined, mcpServers: [] };
  try {
    await args.sendRaw({ method: "session/resume", params }, agentId);
  } catch {
    await args.sendRaw({ method: "session/load", params }, agentId);
  }
  return agentId;
}

export function paneAgentForEvent(
  dest: string,
  mainAgent: AgentId,
  extraAgent?: AgentId | null,
): AgentId {
  if (dest === MAIN_PANE || dest === "main") return mainAgent;
  return extraAgent ?? mainAgent;
}

export function shouldIgnoreAcpEvent(
  paneAgent: AgentId,
  eventAgent: AgentId | undefined,
): boolean {
  if (eventAgent == null) return false;
  return shouldDropAcpEvent(paneAgent, eventAgent);
}

export type ExtraPaneState = {
  sessionId: string;
  cwd: string;
  chat: ChatState;
  draft: string;
  busy: boolean;
  atBottom: boolean;
  queue: QueueState;
  agentId: AgentId;
};

export type AcpSplitState = ExtraPaneState;

export type PaneDest = string;

export type AcpSessionDeps = {
  cwd: string;
  inboxCwd: string;
  projects: string[];
  lastWorkspace: string;
  mode: Mode;
  selectedAgentId: AgentId;
  setSelectedAgentId: (id: AgentId) => void;
  sessionDrafts: Record<string, string>;
  titles: Record<string, string>;
  extraPanes: Record<string, ExtraPaneState>;
  persist: (partial: WebuiState) => void;
  showToast: (msg: string) => void;
  setCwd: (cwd: string) => void;
  setInboxCwd: (cwd: string) => void;
  setDraft: (draft: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setLastWorkspace: (value: string) => void;
  setAtBottom: (value: boolean) => void;
  setOpenProjects: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setUnread: React.Dispatch<React.SetStateAction<UnreadMap>>;
  setExtraPanes: React.Dispatch<React.SetStateAction<Record<string, ExtraPaneState>>>;
  onOpenSplit: () => void;
  onSessionsNeedRefresh: (inbox?: string) => Promise<void>;
  onAcpSessionList: (agentId: AgentId, rows: SessionSummary[]) => void;
  setSawExit: (value: boolean) => void;
  lastActivityRef: React.MutableRefObject<number>;
  steerByDefault: boolean;
  setSessionDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  queueRef: React.MutableRefObject<QueueState>;
  setQueue: React.Dispatch<React.SetStateAction<QueueState>>;
  onLocalSlash: (cmd: CommandDef, rest: string, dest: PaneDest) => Promise<void>;
  onCancelPermission: (target: PaneDest) => Promise<void>;
  injectUserMemory: boolean;
  userMd: string | null;
  doctors: ReadonlyArray<Pick<AgentDoctor, "agentId" | "authPresent">>;
};

export type AcpSession = {
  sessionId: string | null;
  sessionIdRef: React.MutableRefObject<string | null>;
  chat: ChatState;
  setChat: React.Dispatch<React.SetStateAction<ChatState>>;
  busy: boolean;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  ready: boolean;
  connecting: boolean;
  loadingSession: boolean;
  runningSessionId: string | null;
  setRunningSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  runningSessionIdRef: React.MutableRefObject<string | null>;
  readyRef: React.MutableRefObject<boolean>;
  busyRef: React.MutableRefObject<boolean>;
  echoedUser: React.MutableRefObject<boolean>;
  pendingPrompt: React.MutableRefObject<PaneDest | null>;
  rpc: (method: string, params: unknown, opts?: { timeoutMs?: number; dest?: PaneDest; agentId?: AgentId }) => Promise<unknown>;
  ensureAgent: (agentId?: AgentId) => Promise<void>;
  adoptSession: (id: string | null) => void;
  beginMainRun: (sid: string) => void;
  createAcpSession: (work: string) => Promise<string>;
  startInboxSession: () => Promise<void>;
  startNewChat: () => Promise<void>;
  startNewInPane: (paneId: string) => Promise<void>;
  startSession: (workDir?: string) => Promise<void>;
  resumeSession: (s: SessionSummary) => Promise<void>;
  openInPane: (paneId: string, s: SessionSummary) => Promise<void>;
  sendSlashToAgent: (text: string, dest?: PaneDest) => Promise<void>;
  refreshUsage: (id: string, dest?: PaneDest) => Promise<void>;
  sendPrompt: (text: string, dest?: PaneDest) => Promise<void>;
  steerPrompt: (text: string, dest?: PaneDest) => Promise<void>;
  queuePrompt: (text: string, dest?: PaneDest) => void;
  submitPrompt: (text: string, dest?: PaneDest) => void;
  altSubmit: (text: string, dest?: PaneDest) => void;
  cancelTurn: (target?: PaneDest) => Promise<void>;
  onDraftChange: (value: string) => void;
  injectedSessions: Set<string>;
  dismissInjectedSession: (sessionId: string) => void;
  mainAgentIdRef: React.MutableRefObject<AgentId>;
  bindMainAgent: (id: AgentId) => void;
};

export function useAcpSession(deps: AcpSessionDeps): AcpSession {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [busy, setBusy] = useState(false);
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const runningSessionIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const readyByAgentRef = useRef<Partial<Record<AgentId, boolean>>>({});
  const busyRef = useRef(false);
  const pendingRpc = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string }>());
  const echoedUser = useRef(false);
  const echoedExtra = useRef<Record<string, boolean>>({});
  const loadGen = useRef(0);
  const ignoreReplay = useRef(false);
  const ignoreExtraReplay = useRef<Record<string, boolean>>({});
  const pendingPrompt = useRef<PaneDest | null>(null);
  const [injectedSessions, setInjectedSessions] = useState<Set<string>>(() => new Set());
  const injectedRef = useRef(injectedSessions);
  injectedRef.current = injectedSessions;
  const startedRef = useRef(new Set<string>());
  const pendingDest = useRef(new Map<number, PaneDest>());
  const updateCursors = useRef(new Map<string, SessionUpdateCursor>());
  const pendingByPane = useRef<Record<string, Record<string, unknown>[]>>({});
  const cancelFlush = useRef<(() => void) | null>(null);
  const drainRef = useRef<() => void>(() => {});
  const depsRef = useRef(deps);
  depsRef.current = deps;
  busyRef.current = busy;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  useEffect(() => {
    if (!busy) return;
    const tick = () => {
      if (
        shouldClearBusyOnSettledChat({
          busy: true,
          now: Date.now(),
          items: chatRef.current.items,
        })
      ) {
        busyRef.current = false;
        setBusy(false);
        pendingPrompt.current = null;
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy]);
  const selectedAgentIdRef = useRef(deps.selectedAgentId);
  selectedAgentIdRef.current = deps.selectedAgentId;
  const mainAgentIdRef = useRef<AgentId>(deps.selectedAgentId);

  function bindMainAgent(id: AgentId) {
    mainAgentIdRef.current = id;
  }

  function paneAgent(dest: PaneDest): AgentId {
    const extra = dest !== MAIN_PANE;
    return agentIdForPaneDest({
      dest,
      extraAgent: extra ? depsRef.current.extraPanes[dest]?.agentId : undefined,
      mainAgentId: mainAgentIdRef.current,
      chip: selectedAgentIdRef.current,
      hasOpenMainSession: !extra && !!sessionIdRef.current,
    });
  }

  function patchExtra(paneId: string, patch: (prev: ExtraPaneState) => ExtraPaneState) {
    depsRef.current.setExtraPanes((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      return { ...prev, [paneId]: patch(cur) };
    });
  }

  function sessionPaneMap(): Record<string, string> {
    const d = depsRef.current;
    const map: Record<string, string> = {};
    if (sessionIdRef.current) map[sessionIdRef.current] = MAIN_PANE;
    for (const [paneId, pane] of Object.entries(d.extraPanes)) {
      if (pane.sessionId) map[pane.sessionId] = paneId;
    }
    return map;
  }

  function drainPending() {
    const batches = pendingByPane.current;
    pendingByPane.current = {};
    for (const [paneId, updates] of Object.entries(batches)) {
      if (!updates.length) continue;
      if (paneId === MAIN_PANE) {
        setChat((prev) => foldSessionUpdates(prev, updates, { skipUser: echoedUser.current }));
        continue;
      }
      const skipUser = !!echoedExtra.current[paneId];
      patchExtra(paneId, (prev) => ({
        ...prev,
        chat: foldSessionUpdates(prev.chat, updates, { skipUser }),
      }));
    }
  }
  drainRef.current = drainPending;

  function applyPendingNow() {
    cancelFlush.current?.();
    cancelFlush.current = null;
    drainPending();
  }

  function schedulePendingFlush() {
    if (cancelFlush.current) return;
    cancelFlush.current = scheduleSessionUpdateFlush(() => {
      cancelFlush.current = null;
      drainRef.current();
    });
  }

  function enqueueSessionUpdate(params: Record<string, unknown>, dest: PaneDest) {
    const bucket = pendingByPane.current[dest] ?? [];
    bucket.push(params);
    pendingByPane.current[dest] = bucket;
    if (shouldFlushSessionUpdateNow(params)) applyPendingNow();
    else schedulePendingFlush();
  }

  function adoptSession(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
  }

  function clearMainComposer() {
    if (!shouldUnbindBeforeNewChat()) return;
    const sid = runningSessionIdRef.current || sessionIdRef.current;
    const agentId = paneAgent(MAIN_PANE);
    if (shouldCancelAcpOnNewChat() && sid) {
      void sendRaw(sessionCancelNotification(sid), agentId).catch(() => {});
    }
    abandonPendingForDest(pendingRpc.current, pendingDest.current, "main");
    pendingPrompt.current = null;
    adoptSession(null);
    runningSessionIdRef.current = null;
    setRunningSessionId(null);
    busyRef.current = false;
    setBusy(false);
    bindMainAgent(selectedAgentIdRef.current);
    setChat(emptyChat());
    depsRef.current.setDraft("");
    echoedUser.current = false;
  }

  function blockedSendToast(agentId: AgentId): string | null {
    return agentSendBlockReason(agentId, depsRef.current.doctors);
  }

  function beginMainRun(sid: string) {
    runningSessionIdRef.current = sid;
    setRunningSessionId(sid);
    busyRef.current = true;
    setBusy(true);
  }

  async function rpc(
    method: string,
    params: unknown,
    opts?: { timeoutMs?: number; dest?: PaneDest; agentId?: AgentId },
  ): Promise<unknown> {
    const agentId = targetAgentId(opts?.agentId, selectedAgentIdRef.current);
    const id = await nextRpcId();
    if (opts?.dest) pendingDest.current.set(id, opts.dest);
    const timeoutMs = opts?.timeoutMs ?? (method === "session/prompt" ? 0 : 180000);
    return new Promise((resolve, reject) => {
      pendingRpc.current.set(id, { resolve, reject, method });
      void sendRaw({ jsonrpc: "2.0", id, method, params }, agentId).catch((e) => {
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

  function applyWarmupFlags(agentId: AgentId, ok: boolean) {
    const flags = flagsAfterWarmup(ok);
    readyByAgentRef.current[agentId] = flags.ready;
    if (agentId === selectedAgentIdRef.current) {
      readyRef.current = flags.ready;
      setReady(flags.ready);
      depsRef.current.setSawExit(flags.sawExit);
    }
  }

  async function ensureAgent(agentId?: AgentId): Promise<void> {
    const id = targetAgentId(agentId, selectedAgentIdRef.current);
    if (isAgentReady(readyByAgentRef.current, id)) return;
    const inflight = agentBoots[id];
    if (shouldAdoptInFlightBoot(!!inflight, false) && inflight) {
      setConnecting(true);
      try {
        await inflight;
        applyWarmupFlags(id, true);
      } catch (e) {
        applyWarmupFlags(id, false);
        throw e;
      } finally {
        setConnecting(false);
      }
      return;
    }
    setConnecting(true);
    agentBoots[id] = (async () => {
      await startAgent(id);
      const initializeResult = await rpc("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "grok-build-webui", title: "Grok Build", version: "0.4.0" },
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      }, { agentId: id, timeoutMs: initializeTimeoutMs() });
      applyWarmupFlags(id, true);
      setConnecting(false);
      await afterInitializeFetchSessionList(async () => {
        try {
          const listed = await maybeFetchAcpSessionList({
            initializeResult,
            agentId: id,
            rpc,
          });
          if (listed) depsRef.current.onAcpSessionList(id, listed);
        } catch {
          /* session/list is best-effort; do not fail initialize or keep send blocked */
        }
      });
    })()
      .catch((e) => {
        delete agentBoots[id];
        applyWarmupFlags(id, false);
        throw e;
      })
      .finally(() => setConnecting(false));
    return agentBoots[id];
  }

  async function refreshUsage(id: string, dest: PaneDest = MAIN_PANE) {
    try {
      const usage = await readSessionUsage(id);
      if (!usage) return;
      if (dest !== MAIN_PANE) {
        patchExtra(dest, (prev) => (prev.sessionId === id ? { ...prev, chat: { ...prev.chat, usage } } : prev));
        return;
      }
      if (sessionIdRef.current === id) {
        setChat((prev) => ({ ...prev, usage }));
      }
    } catch {
      /* signals.json is best-effort */
    }
  }

  function handleRpcMessage(msg: JsonRpc, eventAgent?: AgentId) {
    const d = depsRef.current;
    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const id = Number(msg.id);
      const waiter = pendingRpc.current.get(id);
      const hadLiveWaiter = !!waiter || pendingDest.current.has(id);
      const method = waiter?.method;
      if (waiter) {
        pendingRpc.current.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      if (
        shouldClearBusyOnPromptResult(msg.result, hadLiveWaiter, method) ||
        shouldClearBusyOnPromptError(msg.error, hadLiveWaiter)
      ) {
        const dest = pendingDest.current.get(id) ?? pendingPrompt.current;
        pendingDest.current.delete(id);
        if (dest && dest !== MAIN_PANE) patchExtra(dest, (prev) => ({ ...prev, busy: false }));
        else {
          busyRef.current = false;
          setBusy(false);
        }
        pendingPrompt.current = null;
      }
    }
    if (msg.method === "session/update" || msg.method === "_x.ai/session/update") {
      const params = asRecord(msg.params);
      const sid = typeof params.sessionId === "string" ? params.sessionId : null;
      if (isDreamSession(sid)) return;
      const dest = sessionUpdateDest(sessionPaneMap(), sid);
      if (dest === "drop") return;
      const extra = dest !== MAIN_PANE;
      const paneAgent = paneAgentForEvent(
        dest,
        mainAgentIdRef.current,
        extra ? d.extraPanes[dest]?.agentId : undefined,
      );
      if (shouldIgnoreAcpEvent(paneAgent, eventAgent)) return;
      if (ignoreReplay.current && !extra) return;
      if (extra && ignoreExtraReplay.current[dest]) return;
      enqueueSessionUpdate(params, dest);
      if (shouldClearBusyOnSessionUpdate(params)) {
        if (extra) patchExtra(dest, (prev) => ({ ...prev, busy: false }));
        else {
          busyRef.current = false;
          setBusy(false);
        }
        pendingPrompt.current = null;
      }
      if (shouldFlushSessionUpdateNow(params)) {
        const id = sid || (extra ? d.extraPanes[dest]?.sessionId ?? null : sessionIdRef.current);
        if (id) void refreshUsage(id, dest);
      }
    }
  }

  const handleRef = useRef(handleRpcMessage);
  handleRef.current = handleRpcMessage;

  useEffect(() => {
    let cancelled = false;
    const offs: Array<() => void> = [];
    void (async () => {
      const a = await onAcpMessage((m, eventAgent) => handleRef.current(m, eventAgent));
      const c = await onAcpStderr((line) => {
        if (shouldClearBusyOnAgentStderr(line)) {
          busyRef.current = false;
          setBusy(false);
          pendingPrompt.current = null;
          const notice = surfaceStderr(line);
          if (notice) setChat((prev) => withPromptFail(prev, notice, Date.now()));
        }
        const msg = surfaceStderr(line);
        if (msg) depsRef.current.showToast(msg);
      });
      const exit = await onAgentExit((eventAgent) => {
        readyByAgentRef.current[eventAgent] = false;
        delete agentBoots[eventAgent];
        if (eventAgent !== selectedAgentIdRef.current) return;
        if (busyRef.current && runningSessionIdRef.current) {
          const id = runningSessionIdRef.current;
          depsRef.current.setUnread((prev) => markUnread(prev, id, "error"));
        }
        readyRef.current = false;
        setReady(false);
        depsRef.current.setSawExit(true);
        setBusy(false);
        depsRef.current.setExtraPanes((prev) => {
          const next: Record<string, ExtraPaneState> = {};
          for (const [id, pane] of Object.entries(prev)) next[id] = { ...pane, busy: false };
          return next;
        });
        setConnecting(false);
        pendingPrompt.current = null;
      });
      if (cancelled) {
        a(); c(); exit();
        cancelFlush.current?.();
        cancelFlush.current = null;
        drainRef.current();
        return;
      }
      offs.push(a, c, exit);
      if (shouldStartWarmup(offs.length > 0, cancelled)) {
        void ensureAgent().catch((e) => {
          depsRef.current.showToast(String(e));
        });
      }
    })();
    return () => {
      cancelled = true;
      offs.forEach((fn) => fn());
      cancelFlush.current?.();
      cancelFlush.current = null;
      drainRef.current();
    };
  }, []);

  useEffect(() => {
    const id = deps.selectedAgentId;
    const ok = isAgentReady(readyByAgentRef.current, id);
    readyRef.current = ok;
    setReady(ok);
  }, [deps.selectedAgentId]);

  async function resumeBoundSession(s: SessionSummary): Promise<AgentId> {
    const chip = selectedAgentIdRef.current;
    const work = resumeWorkspaceCwd(s.cwd);
    if (work) await setWorkspace(work, s.id);
    return resumeOnSessionAgent({
      session: s,
      chip,
      startAgent: (id) => ensureAgent(id),
      sendRaw: async (payload, id) => {
        const rec = asRecord(payload);
        return rpc(String(rec.method ?? ""), rec.params, { agentId: id });
      },
      alreadyReady: (id) => isAgentReady(readyByAgentRef.current, id),
    });
  }

  async function createAcpSession(work: string): Promise<string> {
    const agentId = paneAgent(MAIN_PANE);
    const meta = sessionNewMeta(agentId, depsRef.current.mode === "yolo");
    const result = asRecord(await rpc("session/new", { cwd: work || ".", mcpServers: [], _meta: meta }, { agentId }));
    const sid = sessionIdFromNewResult(result);
    bindMainAgent(agentId);
    adoptSession(sid);
    await setWorkspace(work || ".", sid);
    window.setTimeout(() => void depsRef.current.onSessionsNeedRefresh(), 500);
    return sid;
  }

  async function startInboxSession() {
    const d = depsRef.current;
    clearMainComposer();
    const blocked = blockedSendToast(selectedAgentIdRef.current);
    if (blocked) {
      d.showToast(blocked);
      return;
    }
    try {
      const inbox = await ensureInbox(d.inboxCwd || null);
      d.setInboxCwd(inbox);
      d.persist({ inboxCwd: inbox });
      d.setCwd(inbox);
      setChat(emptyChat());
      d.setDraft("");
      echoedUser.current = false;
      if (shouldCreateAcpSessionOnNewChat()) {
        await ensureAgent();
        await setWorkspace(inbox);
        await createAcpSession(inbox);
      }
      d.setSettingsOpen(false);
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function startSession(workDir?: string) {
    const d = depsRef.current;
    const work = workDir || d.cwd;
    if (!work || (d.inboxCwd && sameCwd(work, d.inboxCwd))) {
      d.showToast("先在输入栏选一个项目目录");
      return;
    }
    if (work !== d.cwd) d.setCwd(work);
    clearMainComposer();
    const blocked = blockedSendToast(selectedAgentIdRef.current);
    if (blocked) {
      d.showToast(blocked);
      return;
    }
    try {
      if (shouldCreateAcpSessionOnNewChat()) {
        await ensureAgent();
        await setWorkspace(work);
        await createAcpSession(work);
      }
      d.setSettingsOpen(false);
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function startNewChat() {
    const d = depsRef.current;
    const work = resolveLastWorkspace(d.lastWorkspace, d.projects, d.inboxCwd);
    if (!work || (d.inboxCwd && sameCwd(work, d.inboxCwd))) {
      await startInboxSession();
      return;
    }
    await startSession(work);
  }

  async function startNewInPane(paneId: string) {
    if (paneId === MAIN_PANE) {
      await startNewChat();
      return;
    }
    const d = depsRef.current;
    const work = resolveLastWorkspace(d.lastWorkspace, d.projects, d.inboxCwd);
    if (!work) {
      d.showToast("先在输入栏选一个项目目录");
      return;
    }
    try {
      const agentId = selectedAgentIdRef.current;
      await ensureAgent(agentId);
      const inbox = d.inboxCwd && sameCwd(work, d.inboxCwd);
      const dir = inbox ? d.inboxCwd || work : work;
      await setWorkspace(dir);
      const meta = sessionNewMeta(agentId, d.mode === "yolo");
      const result = asRecord(await rpc("session/new", { cwd: dir || ".", mcpServers: [], _meta: meta }, { dest: paneId, agentId }));
      const sid = sessionIdFromNewResult(result);
      echoedExtra.current[paneId] = false;
      d.setExtraPanes((prev) => ({
        ...prev,
        [paneId]: {
          sessionId: sid,
          cwd: dir,
          chat: emptyChat(),
          draft: "",
          busy: false,
          atBottom: true,
          queue: emptyQueue(),
          agentId,
        },
      }));
      window.setTimeout(() => void d.onSessionsNeedRefresh(), 500);
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function resumeSession(s: SessionSummary) {
    const d = depsRef.current;
    const planned = planOpenSession({
      session: s,
      alreadyBound: false,
      currentChip: selectedAgentIdRef.current,
    });
    d.setSelectedAgentId(planned.selectedAfterOpen);
    bindMainAgent(planned.selectedAfterOpen);
    const last = lastWorkspaceAfterOpen(s.cwd, d.inboxCwd, d.lastWorkspace);
    if (last !== d.lastWorkspace) {
      d.setLastWorkspace(last);
      d.persist({ lastWorkspace: last });
    }
    const token = ++loadGen.current;
    const work = resumeWorkspaceCwd(s.cwd);
    if (work) {
      if (work !== d.cwd) d.setCwd(work);
    } else if (d.inboxCwd && d.cwd !== d.inboxCwd) {
      d.setCwd(d.inboxCwd);
    }
    d.setOpenProjects((m) => ({ ...m, [projectForSession(s.cwd, d.projects, d.inboxCwd).path]: true }));
    adoptSession(s.id);
    d.setDraft(getDraft(d.sessionDrafts, s.id));
    if (s.parentSessionId) {
      const pid = s.parentSessionId;
      d.setCollapsedIds((prev) => {
        const n = new Set(prev);
        n.delete(pid);
        return n;
      });
      d.setExpandedIds((prev) => new Set(prev).add(pid));
    }
    echoedUser.current = false;
    d.setAtBottom(true);
    setLoadingSession(true);
    d.setSettingsOpen(false);
    d.lastActivityRef.current = Date.now();
    d.setUnread((prev) => {
      const next = clearUnread(prev, s.id);
      if (next !== prev) d.persist({ unread: next });
      return next;
    });
    try {
      const page = await readSessionUpdates(s.id, afterByteFor(updateCursors.current, s.id) ?? null, s.dir);
      if (token !== loadGen.current) return;
      const next = applySessionPage(updateCursors.current, s.id, page);
      setChat(next);
      if (chatHasPromptHistory(next.items)) startedRef.current = markStarted(startedRef.current, s.id);
      void refreshUsage(s.id);
      setLoadingSession(false);
      ignoreReplay.current = ignoreAcpHistoryDuringResume(page.rows.length);
      try {
        await resumeBoundSession(s);
      } finally {
        ignoreReplay.current = false;
      }
    } catch (e) {
      if (token !== loadGen.current) return;
      d.showToast(String(e));
    } finally {
      if (token === loadGen.current) setLoadingSession(false);
    }
  }

  async function openInPane(paneId: string, s: SessionSummary) {
    const d = depsRef.current;
    if (paneId === MAIN_PANE) {
      await resumeSession(s);
      return;
    }
    if (s.id === sessionIdRef.current) {
      d.showToast("已在当前窗口");
      return;
    }
    d.onOpenSplit();
    echoedExtra.current[paneId] = false;
    try {
      const page = await readSessionUpdates(s.id, afterByteFor(updateCursors.current, s.id) ?? null, s.dir);
      ignoreExtraReplay.current[paneId] = ignoreAcpHistoryDuringResume(page.rows.length);
      const next = applySessionPage(updateCursors.current, s.id, page);
      const { agentId, selectedAfterOpen } = openSessionAgent(s, selectedAgentIdRef.current);
      d.setSelectedAgentId(selectedAfterOpen);
      d.setExtraPanes((prev) => ({
        ...prev,
        [paneId]: {
          sessionId: s.id,
          cwd: s.cwd,
          chat: next,
          draft: prev[paneId]?.draft ?? "",
          busy: false,
          atBottom: true,
          queue: prev[paneId]?.queue ?? { items: [], nextId: 1 },
          agentId,
        },
      }));
      if (chatHasPromptHistory(next.items)) startedRef.current = markStarted(startedRef.current, s.id);
      void refreshUsage(s.id, paneId);
      try {
        await resumeBoundSession(s);
      } finally {
        ignoreExtraReplay.current[paneId] = false;
      }
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function sendSlashToAgent(text: string, dest: PaneDest = MAIN_PANE) {
    const agentId = paneAgent(dest);
    await ensureAgent(agentId);
    if (dest !== MAIN_PANE) {
      const pane = depsRef.current.extraPanes[dest];
      if (!pane) return;
      patchExtra(dest, (prev) => ({ ...prev, busy: true }));
      await rpc(
        "session/prompt",
        { sessionId: pane.sessionId, prompt: [{ type: "text", text }] },
        { dest, agentId },
      );
      return;
    }
    let sid = sessionIdRef.current;
    if (!sid) sid = await createAcpSession(depsRef.current.cwd || depsRef.current.inboxCwd || ".");
    beginMainRun(sid);
    await rpc(
      "session/prompt",
      { sessionId: sid, prompt: [{ type: "text", text }] },
      { dest: "main", agentId: paneAgent(MAIN_PANE) },
    );
  }

  /**
   * Inject a message into the turn that is already running. The agent decides
   * when to read it; the tool call in flight is not cancelled. If the CLI
   * refuses a second prompt on a live session we fall back to the queue rather
   * than losing the message.
   */
  async function steerPrompt(text: string, dest: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    const extra = dest !== MAIN_PANE ? d.extraPanes[dest] : null;
    const sid = extra ? extra.sessionId : sessionIdRef.current;
    if (!sid) {
      queuePrompt(text, dest);
      return;
    }
    const at = Date.now();
    if (extra) {
      echoedExtra.current[dest] = true;
      patchExtra(dest, (prev) => ({
        ...prev,
        chat: withEchoedUser(prev.chat, text, "u-steer", at),
        draft: "",
      }));
    } else {
      echoedUser.current = true;
      setChat((prev) => withEchoedUser(prev, text, "u-steer", at));
      d.setDraft("");
    }
    try {
      const agentId = paneAgent(dest);
      await ensureAgent(agentId);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest, agentId });
    } catch (e) {
      d.showToast(`改向失败，已改为排队：${String(e)}`);
      queuePrompt(text, dest);
    }
  }

  function queuePrompt(text: string, dest: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    if (dest !== MAIN_PANE) {
      const pane = d.extraPanes[dest];
      if (!pane) return;
      const next = enqueue(pane.queue, text);
      if (next === pane.queue) {
        d.showToast("队列已满，等这一轮结束");
        return;
      }
      patchExtra(dest, (prev) => ({ ...prev, queue: next, draft: "" }));
      return;
    }
    const next = enqueue(d.queueRef.current, text);
    if (next === d.queueRef.current) {
      d.showToast("队列已满，等这一轮结束");
      return;
    }
    d.queueRef.current = next;
    d.setQueue(next);
    d.setDraft("");
    if (sessionIdRef.current) {
      const drafts = writeDraft(d.sessionDrafts, sessionIdRef.current, "");
      d.setSessionDrafts(drafts);
      d.persist({ drafts });
    }
  }

  function submitPrompt(text: string, dest: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    if (!text.trim()) return;
    const paneBusy = dest !== MAIN_PANE ? !!d.extraPanes[dest]?.busy : busyRef.current;
    if (!paneBusy) {
      void sendPrompt(text, dest);
      return;
    }
    if (d.steerByDefault) void steerPrompt(text, dest);
    else queuePrompt(text, dest);
  }

  function altSubmit(text: string, dest: PaneDest = MAIN_PANE) {
    if (!text.trim()) return;
    if (depsRef.current.steerByDefault) queuePrompt(text, dest);
    else void steerPrompt(text, dest);
  }

  async function sendPrompt(text: string, dest: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    const extra = dest !== MAIN_PANE;
    if (!text.trim() || loadingSession) return;
    if (extra ? d.extraPanes[dest]?.busy : busyRef.current) return;
    if (!extra && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, chat.commands).find((c) => c.name === name);
      if (found?.local) {
        d.setDraft("");
        return d.onLocalSlash(found, text.slice(name.length).trimStart(), MAIN_PANE);
      }
    }
    if (extra && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, d.extraPanes[dest]?.chat.commands ?? []).find((c) => c.name === name);
      if (found?.local) {
        patchExtra(dest, (prev) => ({ ...prev, draft: "" }));
        return d.onLocalSlash(found, text.slice(name.length).trimStart(), dest);
      }
    }
    let acpText = text;
    let wrapInjected = false;
    try {
      const sidGuess = extra ? d.extraPanes[dest]?.sessionId : sessionIdRef.current;
      const wrap = resolveOutgoingPrompt({
        sessionId: sidGuess || "pending",
        alreadyInjected: sidGuess ? startedRef.current.has(sidGuess) : false,
        injectOn: d.injectUserMemory,
        userMd: d.userMd,
        userText: text,
      });
      acpText = wrap.text;
      wrapInjected = wrap.injected;
    } catch {
      acpText = text;
    }
    if (extra) {
      const pane = d.extraPanes[dest];
      if (!pane) return;
      const extraAgent = paneAgent(dest);
      const extraBlocked = blockedSendToast(extraAgent);
      if (extraBlocked) {
        d.showToast(extraBlocked);
        return;
      }
      const at = Date.now();
      echoedExtra.current[dest] = true;
      pendingPrompt.current = dest;
      patchExtra(dest, (prev) => ({
        ...prev,
        chat: withEchoedUser(prev.chat, text, "u-local", at),
        draft: "",
        busy: true,
        atBottom: true,
      }));
      try {
        const agentId = paneAgent(dest);
        await ensureAgent(agentId);
        if (pane.cwd) await setWorkspace(pane.cwd, pane.sessionId);
        await rpc("session/prompt", { sessionId: pane.sessionId, prompt: [{ type: "text", text: acpText }] }, { dest, agentId });
        startedRef.current = markStarted(startedRef.current, pane.sessionId);
        if (wrapInjected) {
          const next = markInjected(injectedRef.current, pane.sessionId, true);
          injectedRef.current = next;
          setInjectedSessions(next);
        }
      } catch (e) {
        patchExtra(dest, (prev) => ({ ...prev, busy: false }));
        d.showToast(String(e));
      }
      return;
    }
    const agentId = paneAgent(MAIN_PANE);
    const blocked = blockedSendToast(agentId);
    if (blocked) {
      d.showToast(blocked);
      return;
    }
    echoedUser.current = true;
    setChat((prev) => withEchoedUser(prev, text, "u-local", Date.now()));
    d.setDraft("");
    if (sessionIdRef.current) {
      const nextDrafts = writeDraft(d.sessionDrafts, sessionIdRef.current, "");
      d.setSessionDrafts(nextDrafts);
      d.persist({ drafts: nextDrafts });
    }
    d.setAtBottom(true);
    pendingPrompt.current = "main";
    const existing = sessionIdRef.current;
    if (existing) beginMainRun(existing);
    else {
      busyRef.current = true;
      setBusy(true);
    }
    try {
      const agentId = paneAgent(MAIN_PANE);
      await ensureAgent(agentId);
      let sid = sessionIdRef.current;
      if (!sid) sid = await createAcpSession(d.cwd || d.inboxCwd || ".");
      if (sid !== existing) beginMainRun(sid);
      if (d.cwd) await setWorkspace(d.cwd, sid);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text: acpText }] }, { dest: "main", agentId: paneAgent(MAIN_PANE) });
      startedRef.current = markStarted(startedRef.current, sid);
      if (wrapInjected) {
        const next = markInjected(injectedRef.current, sid, true);
        injectedRef.current = next;
        setInjectedSessions(next);
      }
    } catch (e) {
      busyRef.current = false;
      setBusy(false);
      if (isAbandonedPromptError(e)) return;
      d.showToast(String(e));
      setChat((prev) => withPromptFail(prev, String(e), Date.now()));
    }
  }

  function dismissInjectedSession(id: string) {
    const next = dismissInjected(injectedRef.current, id);
    injectedRef.current = next;
    setInjectedSessions(next);
  }

  async function cancelTurn(target: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    const sid = target !== MAIN_PANE ? d.extraPanes[target]?.sessionId : runningSessionIdRef.current;
    try {
      if (sid) await sendRaw({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sid } }, paneAgent(target));
      await d.onCancelPermission(target);
    } finally {
      if (target !== MAIN_PANE) patchExtra(target, (prev) => ({ ...prev, busy: false }));
      else {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function onDraftChange(value: string) {
    const d = depsRef.current;
    d.setDraft(value);
    const next = writeDraft(d.sessionDrafts, sessionIdRef.current, value);
    d.setSessionDrafts(next);
    d.persist({ drafts: next });
  }

  return {
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
    busyRef,
    echoedUser,
    pendingPrompt,
    rpc,
    ensureAgent,
    adoptSession,
    beginMainRun,
    createAcpSession,
    startInboxSession,
    startNewChat,
    startNewInPane,
    startSession,
    resumeSession,
    openInPane,
    sendSlashToAgent,
    refreshUsage,
    sendPrompt,
    steerPrompt,
    queuePrompt,
    submitPrompt,
    altSubmit,
    cancelTurn,
    onDraftChange,
    injectedSessions,
    dismissInjectedSession,
    mainAgentIdRef,
    bindMainAgent,
  };
}
