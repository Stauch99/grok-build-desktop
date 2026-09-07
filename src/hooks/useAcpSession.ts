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
  itemsAfterLastUser,
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
import { tryEnqueue, emptyQueue, type QueueState } from "../lib/prompt-queue";
import { agentChipLabel } from "../lib/agent-chip";
import { blockedAgentToast, type AgentDoctor } from "../lib/agent-doctor";
import { lastWorkspaceAfterOpen, projectForSession, resolveLastWorkspace, resumeWorkspaceCwd } from "../lib/sidebar-list";
import { getDraft, setDraft as writeDraft, resumeComposerDraft, isStaleSentDraftChange } from "../lib/session-drafts";
import { isLiveRosterId } from "../lib/live-roster";
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
import { t, type Locale } from "../lib/i18n";
import { createdSessionSummary, maybeFetchAcpSessionList } from "../lib/session-acp-list";
import { titleFromUserText } from "../lib/session-title";

const MAIN_PANE = "main";
const agentBoots: Partial<Record<AgentId, Promise<void>>> = {};

export function sessionIdFromNewResult(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error(t("zh", "acp.noSessionId"));
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

export function shouldClearBusyAfterPromptCatch(e: unknown): boolean {
  return !isAbandonedPromptError(e);
}

export function shouldKeepBusyForNewerPrompt(startedGen: number, activeGen: number): boolean {
  return activeGen !== startedGen;
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
        title: t("zh", "acp.requestFailed"),
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

export function destHasPendingPrompt(
  pendingRpc: Map<number, { method?: string }>,
  pendingDest: Map<number, string>,
  dest: string,
): boolean {
  for (const [id, pane] of pendingDest) {
    if (pane === dest && pendingRpc.get(id)?.method === "session/prompt") return true;
  }
  return false;
}

export function shouldIdleAfterPromptRpc(opts: {
  clearOnResult: boolean;
  otherPromptWaiters: boolean;
}): boolean {
  return opts.clearOnResult && !opts.otherPromptWaiters;
}

export function shouldSettlePaneBusy(opts: { settled: boolean; pendingPrompt: boolean }): boolean {
  return opts.settled && !opts.pendingPrompt;
}

export function cancelTargetSessionId(
  runningSessionId: string | null | undefined,
  boundSessionId: string | null | undefined,
): string | null {
  return runningSessionId || boundSessionId || null;
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

export function stderrToastText(eventAgent: AgentId, line: string): string | null {
  const msg = surfaceStderr(line);
  if (!msg) return null;
  return `${agentChipLabel(eventAgent)} · ${msg}`;
}

export function agentExitToastText(eventAgent: AgentId): string {
  return t("zh", "acp.agentExited", { agent: agentChipLabel(eventAgent) });
}

export function extraPanesHitAgent(
  panes: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
): boolean {
  return Object.values(panes).some((pane) => pane.agentId === eventAgent);
}

export function extraPanesAfterAgentExit(
  prev: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
): Record<string, ExtraPaneState> {
  let changed = false;
  const next: Record<string, ExtraPaneState> = {};
  for (const [id, pane] of Object.entries(prev)) {
    if (pane.agentId === eventAgent && pane.busy) {
      next[id] = { ...pane, busy: false };
      changed = true;
    } else {
      next[id] = pane;
    }
  }
  return changed ? next : prev;
}

export function extraPanesAfterAgentStderr(
  prev: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
  line: string,
  now: number,
): Record<string, ExtraPaneState> {
  if (!shouldClearBusyOnAgentStderr(line)) return prev;
  const notice = surfaceStderr(line);
  let changed = false;
  const next: Record<string, ExtraPaneState> = {};
  for (const [id, pane] of Object.entries(prev)) {
    if (shouldIgnoreAcpEvent(pane.agentId, eventAgent)) {
      next[id] = pane;
      continue;
    }
    next[id] = {
      ...pane,
      busy: false,
      chat: notice ? withPromptFail(pane.chat, notice, now) : pane.chat,
    };
    changed = true;
  }
  return changed ? next : prev;
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
  model: string;
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
  onSessionCreated: (row: SessionSummary) => void;
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
  doctors: ReadonlyArray<Pick<AgentDoctor, "agentId" | "authPresent" | "binary" | "loginHint">>;
  locale?: Locale;
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
  createAcpSession: (work: string, title?: string) => Promise<string>;
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
  const lastSentRef = useRef("");
  const promptGen = useRef<Record<string, number>>({});
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
  const extraChatRef = useRef<Record<string, ChatState>>({});
  const extraBusyKey = Object.entries(deps.extraPanes)
    .filter(([, pane]) => pane.busy)
    .map(([id]) => id)
    .join(",");
  const seenAssistantAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!busy && !extraBusyKey) {
      seenAssistantAtRef.current = null;
      return;
    }
    const tick = () => {
      const items = chatRef.current.items;
      const turn = itemsAfterLastUser(items);
      if (
        seenAssistantAtRef.current == null &&
        turn.some((it) => it.kind === "assistant" && it.text.trim())
      ) {
        seenAssistantAtRef.current = Date.now();
      }
      if (
        shouldSettlePaneBusy({
          settled:
            !!busyRef.current &&
            shouldClearBusyOnSettledChat({
              busy: true,
              now: Date.now(),
              items,
              seenAssistantAt: seenAssistantAtRef.current,
            }),
          pendingPrompt: destHasPendingPrompt(pendingRpc.current, pendingDest.current, MAIN_PANE),
        })
      ) {
        busyRef.current = false;
        setBusy(false);
        pendingPrompt.current = null;
      }
      for (const [id, pane] of Object.entries(depsRef.current.extraPanes)) {
        if (!pane.busy) continue;
        if (
          shouldSettlePaneBusy({
            settled: shouldClearBusyOnSettledChat({
              busy: true,
              now: Date.now(),
              items: pane.chat.items,
            }),
            pendingPrompt: destHasPendingPrompt(pendingRpc.current, pendingDest.current, id),
          })
        ) {
          patchExtra(id, (prev) => ({ ...prev, busy: false }));
          if (pendingPrompt.current === id) pendingPrompt.current = null;
        }
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, extraBusyKey]);
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
        setChat((prev) => {
          const next = foldSessionUpdates(prev, updates, { skipUser: echoedUser.current });
          chatRef.current = next;
          return next;
        });
        continue;
      }
      const skipUser = !!echoedExtra.current[paneId];
      patchExtra(paneId, (prev) => {
        const next = foldSessionUpdates(prev.chat, updates, { skipUser });
        extraChatRef.current[paneId] = next;
        return { ...prev, chat: next };
      });
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
    if (id !== sessionIdRef.current) {
      abandonPendingForDest(pendingRpc.current, pendingDest.current, MAIN_PANE);
      pendingPrompt.current = null;
    }
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
    return blockedAgentToast(agentId, depsRef.current.doctors);
  }

  function bumpPromptGen(dest: string): number {
    const next = (promptGen.current[dest] ?? 0) + 1;
    promptGen.current[dest] = next;
    return next;
  }

  function beginMainRun(sid: string) {
    bumpPromptGen(MAIN_PANE);
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
            reject(new Error(t(depsRef.current.locale ?? "zh", "acp.timeout", { method })));
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
      }, { agentId: id, timeoutMs: initializeTimeoutMs(id) });
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
      const dest = pendingDest.current.get(id) ?? pendingPrompt.current;
      if (waiter) {
        pendingRpc.current.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      pendingDest.current.delete(id);
      if (
        shouldIdleAfterPromptRpc({
          clearOnResult:
            shouldClearBusyOnPromptResult(msg.result, hadLiveWaiter, method) ||
            shouldClearBusyOnPromptError(msg.error, hadLiveWaiter),
          otherPromptWaiters: dest
            ? destHasPendingPrompt(pendingRpc.current, pendingDest.current, dest)
            : false,
        })
      ) {
        if (dest && dest !== MAIN_PANE) patchExtra(dest, (prev) => ({ ...prev, busy: false }));
        else {
          busyRef.current = false;
          setBusy(false);
        }
        pendingPrompt.current = null;
        void d.onSessionsNeedRefresh();
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
      const destKey = extra ? dest : MAIN_PANE;
      const items = extra
        ? extraChatRef.current[dest]?.items ?? d.extraPanes[dest]?.chat.items
        : chatRef.current.items;
      if (
        shouldClearBusyOnSessionUpdate(params, items) &&
        !destHasPendingPrompt(pendingRpc.current, pendingDest.current, destKey)
      ) {
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
      const c = await onAcpStderr((line, eventAgent) => {
        const toast = stderrToastText(eventAgent, line);
        if (toast) depsRef.current.showToast(toast);
        if (!shouldClearBusyOnAgentStderr(line)) return;
        if (!shouldIgnoreAcpEvent(mainAgentIdRef.current, eventAgent)) {
          busyRef.current = false;
          setBusy(false);
          pendingPrompt.current = null;
          const notice = surfaceStderr(line);
          if (notice) setChat((prev) => withPromptFail(prev, notice, Date.now()));
        }
        depsRef.current.setExtraPanes((prev) => extraPanesAfterAgentStderr(prev, eventAgent, line, Date.now()));
      });
      const exit = await onAgentExit((eventAgent) => {
        readyByAgentRef.current[eventAgent] = false;
        delete agentBoots[eventAgent];
        const d = depsRef.current;
        const hitMain = mainAgentIdRef.current === eventAgent;
        const hitExtra = extraPanesHitAgent(d.extraPanes, eventAgent);
        if (hitMain) {
          if (busyRef.current && runningSessionIdRef.current) {
            const id = runningSessionIdRef.current;
            d.setUnread((prev) => markUnread(prev, id, "error"));
          }
          readyRef.current = false;
          setReady(false);
          d.setSawExit(true);
          setBusy(false);
          setConnecting(false);
          pendingPrompt.current = null;
        }
        if (hitExtra) {
          d.setExtraPanes((prev) => extraPanesAfterAgentExit(prev, eventAgent));
        }
        if (hitMain || hitExtra) d.showToast(agentExitToastText(eventAgent));
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

  function announceCreatedSession(args: { id: string; cwd: string; agentId: AgentId; title?: string }) {
    const d = depsRef.current;
    d.onSessionCreated(
      createdSessionSummary({
        id: args.id,
        cwd: args.cwd,
        agentId: args.agentId,
        title: args.title,
        model: d.model,
      }),
    );
    void d.onSessionsNeedRefresh();
  }

  async function createAcpSession(work: string, title?: string): Promise<string> {
    const agentId = paneAgent(MAIN_PANE);
    const meta = sessionNewMeta(agentId, depsRef.current.mode === "yolo", depsRef.current.model);
    const result = asRecord(await rpc("session/new", { cwd: work || ".", mcpServers: [], _meta: meta }, { agentId }));
    const sid = sessionIdFromNewResult(result);
    bindMainAgent(agentId);
    adoptSession(sid);
    await setWorkspace(work || ".", sid);
    announceCreatedSession({ id: sid, cwd: work || ".", agentId, title });
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
      d.showToast(t(d.locale ?? "zh", "toast.pickProjectFirst"));
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
      d.showToast(t(d.locale ?? "zh", "toast.pickProjectFirst"));
      return;
    }
    try {
      const agentId = selectedAgentIdRef.current;
      await ensureAgent(agentId);
      const inbox = d.inboxCwd && sameCwd(work, d.inboxCwd);
      const dir = inbox ? d.inboxCwd || work : work;
      await setWorkspace(dir);
      const meta = sessionNewMeta(agentId, d.mode === "yolo", d.model);
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
      announceCreatedSession({ id: sid, cwd: dir, agentId });
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function resumeSession(s: SessionSummary) {
    if (isLiveRosterId(s.id)) {
      const parentId = s.parentSessionId;
      if (!parentId) return;
      s = { ...s, id: parentId, parentSessionId: undefined, sessionKind: undefined };
    }
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
      chatRef.current = next;
      setChat(next);
      const stored = getDraft(d.sessionDrafts, s.id);
      const restore = resumeComposerDraft(next.items, stored);
      d.setDraft(restore);
      if (restore !== stored) {
        const drafts = writeDraft(d.sessionDrafts, s.id, restore);
        d.setSessionDrafts(drafts);
        d.persist({ drafts });
      }
      if (chatHasPromptHistory(next.items)) startedRef.current = markStarted(startedRef.current, s.id);
      void refreshUsage(s.id);
      setLoadingSession(false);
      ignoreReplay.current = ignoreAcpHistoryDuringResume(page.rows.length);
      try {
        await resumeBoundSession(s);
      } catch (e) {
        if (!chatHasPromptHistory(next.items) && next.items.length === 0) throw e;
        d.showToast(String(e));
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
      d.showToast(t(d.locale ?? "zh", "toast.alreadyInWindow"));
      return;
    }
    d.onOpenSplit();
    echoedExtra.current[paneId] = false;
    try {
      const page = await readSessionUpdates(s.id, afterByteFor(updateCursors.current, s.id) ?? null, s.dir);
      ignoreExtraReplay.current[paneId] = ignoreAcpHistoryDuringResume(page.rows.length);
      const next = applySessionPage(updateCursors.current, s.id, page);
      extraChatRef.current[paneId] = next;
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
      } catch (e) {
        if (!chatHasPromptHistory(next.items) && next.items.length === 0) throw e;
        d.showToast(String(e));
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
      const extraGen = bumpPromptGen(dest);
      patchExtra(dest, (prev) => ({ ...prev, busy: true }));
      try {
        await rpc(
          "session/prompt",
          { sessionId: pane.sessionId, prompt: [{ type: "text", text }] },
          { dest, agentId },
        );
      } catch (e) {
        if (shouldKeepBusyForNewerPrompt(extraGen, promptGen.current[dest] ?? 0)) return;
        if (!shouldClearBusyAfterPromptCatch(e)) return;
        patchExtra(dest, (prev) => ({ ...prev, busy: false }));
      }
      return;
    }
    let sid = sessionIdRef.current;
    if (!sid) {
      sid = await createAcpSession(
        depsRef.current.cwd || depsRef.current.inboxCwd || ".",
        titleFromUserText(text),
      );
    }
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
      patchExtra(dest, (prev) => {
        const chat = withEchoedUser(prev.chat, text, "u-steer", at);
        extraChatRef.current[dest] = chat;
        return { ...prev, chat, draft: "" };
      });
    } else {
      echoedUser.current = true;
      setChat((prev) => {
        const next = withEchoedUser(prev, text, "u-steer", at);
        chatRef.current = next;
        return next;
      });
      d.setDraft("");
      lastSentRef.current = text;
    }
    try {
      const agentId = paneAgent(dest);
      await ensureAgent(agentId);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest, agentId });
    } catch (e) {
      d.showToast(t(d.locale ?? "zh", "toast.steerQueued", { error: String(e) }));
      queuePrompt(text, dest);
    }
  }

  function queuePrompt(text: string, dest: PaneDest = MAIN_PANE) {
    const d = depsRef.current;
    if (dest !== MAIN_PANE) {
      const pane = d.extraPanes[dest];
      if (!pane) return;
      const result = tryEnqueue(pane.queue, text);
      if (!result.ok) {
        if (result.reason === "full") {
          d.showToast(t(d.locale ?? "zh", "toast.queueFull"));
          patchExtra(dest, (prev) => ({ ...prev, draft: text }));
        }
        return;
      }
      patchExtra(dest, (prev) => ({ ...prev, queue: result.state, draft: "" }));
      return;
    }
    const result = tryEnqueue(d.queueRef.current, text);
    if (!result.ok) {
      if (result.reason === "full") {
        d.showToast(t(d.locale ?? "zh", "toast.queueFull"));
        d.setDraft(text);
      }
      return;
    }
    d.queueRef.current = result.state;
    d.setQueue(result.state);
    d.setDraft("");
    lastSentRef.current = text;
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
    const destKey = extra ? dest : MAIN_PANE;
    if (destHasPendingPrompt(pendingRpc.current, pendingDest.current, destKey)) {
      abandonPendingForDest(pendingRpc.current, pendingDest.current, destKey);
      pendingPrompt.current = null;
      const sid = extra
        ? d.extraPanes[dest]?.sessionId
        : runningSessionIdRef.current || sessionIdRef.current;
      if (sid) {
        await sendRaw(sessionCancelNotification(sid), paneAgent(destKey)).catch(() => {});
      }
      if (extra) patchExtra(dest, (prev) => ({ ...prev, busy: false }));
      else {
        busyRef.current = false;
        setBusy(false);
      }
    }
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
      const firstTurn = !pane.chat.items.some((item) => item.kind === "user");
      const at = Date.now();
      echoedExtra.current[dest] = true;
      pendingPrompt.current = dest;
      const extraGen = bumpPromptGen(dest);
      patchExtra(dest, (prev) => {
        const chat = withEchoedUser(prev.chat, text, "u-local", at);
        extraChatRef.current[dest] = chat;
        return { ...prev, chat, draft: "", busy: true, atBottom: true };
      });
      if (firstTurn) {
        announceCreatedSession({
          id: pane.sessionId,
          cwd: pane.cwd,
          agentId: extraAgent,
          title: titleFromUserText(text),
        });
      }
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
        if (shouldKeepBusyForNewerPrompt(extraGen, promptGen.current[dest] ?? 0)) return;
        if (!shouldClearBusyAfterPromptCatch(e)) return;
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
    const firstTurn = !chat.items.some((item) => item.kind === "user");
    echoedUser.current = true;
    setChat((prev) => {
      const next = withEchoedUser(prev, text, "u-local", Date.now());
      chatRef.current = next;
      return next;
    });
    d.setDraft("");
    lastSentRef.current = text;
    let drafts = writeDraft(d.sessionDrafts, sessionIdRef.current, "");
    d.setSessionDrafts(drafts);
    d.persist({ drafts });
    d.setAtBottom(true);
    pendingPrompt.current = "main";
    const existing = sessionIdRef.current;
    if (existing) beginMainRun(existing);
    else {
      bumpPromptGen(MAIN_PANE);
      busyRef.current = true;
      setBusy(true);
    }
    let mainGen = promptGen.current[MAIN_PANE] ?? 0;
    try {
      const agentId = paneAgent(MAIN_PANE);
      await ensureAgent(agentId);
      let sid = sessionIdRef.current;
      if (!sid) {
        sid = await createAcpSession(d.cwd || d.inboxCwd || ".", titleFromUserText(text));
      } else if (firstTurn) {
        announceCreatedSession({
          id: sid,
          cwd: d.cwd || d.inboxCwd || ".",
          agentId,
          title: titleFromUserText(text),
        });
      }
      if (sid !== existing) {
        drafts = writeDraft(writeDraft(drafts, existing, ""), sid, "");
        d.setSessionDrafts(drafts);
        d.persist({ drafts });
        beginMainRun(sid);
        mainGen = promptGen.current[MAIN_PANE] ?? mainGen;
      }
      if (d.cwd) await setWorkspace(d.cwd, sid);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text: acpText }] }, { dest: "main", agentId: paneAgent(MAIN_PANE) });
      drafts = writeDraft(drafts, sid, "");
      d.setSessionDrafts(drafts);
      d.persist({ drafts });
      startedRef.current = markStarted(startedRef.current, sid);
      if (wrapInjected) {
        const next = markInjected(injectedRef.current, sid, true);
        injectedRef.current = next;
        setInjectedSessions(next);
      }
    } catch (e) {
      if (shouldKeepBusyForNewerPrompt(mainGen, promptGen.current[MAIN_PANE] ?? 0)) return;
      if (!shouldClearBusyAfterPromptCatch(e)) return;
      busyRef.current = false;
      setBusy(false);
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
    const destKey = target !== MAIN_PANE ? target : MAIN_PANE;
    const gen = promptGen.current[destKey] ?? 0;
    const sid =
      target !== MAIN_PANE
        ? d.extraPanes[target]?.sessionId
        : cancelTargetSessionId(runningSessionIdRef.current, sessionIdRef.current);
    try {
      if (sid) await sendRaw({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sid } }, paneAgent(target));
      await d.onCancelPermission(target);
    } finally {
      if (shouldKeepBusyForNewerPrompt(gen, promptGen.current[destKey] ?? 0)) return;
      abandonPendingForDest(pendingRpc.current, pendingDest.current, destKey);
      if (pendingPrompt.current === destKey) pendingPrompt.current = null;
      if (target !== MAIN_PANE) patchExtra(target, (prev) => ({ ...prev, busy: false }));
      else {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function onDraftChange(value: string) {
    const d = depsRef.current;
    if (isStaleSentDraftChange({ next: value, lastSent: lastSentRef.current, current: "" })) {
      lastSentRef.current = "";
      return;
    }
    lastSentRef.current = "";
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
