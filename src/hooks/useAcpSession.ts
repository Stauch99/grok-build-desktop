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
  applyChatUpdate,
  applySessionPage,
  emptyChat,
  shouldKeepSessionUpdate,
  type ChatState,
  type SessionUpdateCursor,
} from "../lib/chat";
import { filterCommands, type CommandDef } from "../lib/commands";
import { sameCwd } from "../lib/inbox";
import { shouldDropAcpEvent } from "../lib/acp-host";
import type { AgentId } from "../lib/agent-id";
import type { Mode } from "../lib/mode";
import { enqueue, type QueueState } from "../lib/prompt-queue";
import { INBOX_PIN, projectForSession, resolveLastWorkspace } from "../lib/sidebar-list";
import { getDraft, setDraft as writeDraft } from "../lib/session-drafts";
import { agentIdOfSession, selectedAgentAfterOpen } from "../lib/session-agent";
import { clearUnread, markUnread, type UnreadMap } from "../lib/session-status";
import { flagsAfterWarmup, shouldAdoptInFlightBoot, shouldStartWarmup } from "../lib/agent-warmup";
import { asRecord, surfaceStderr } from "../lib/text";
import { resolveOutgoingPrompt } from "../lib/memory-inject";
import { chatHasPromptHistory, dismissInjected, markInjected, markStarted } from "../lib/memory-inject-session";
import { isDreamSession } from "../lib/memory-dream-acp";

const agentBoots: Partial<Record<AgentId, Promise<void>>> = {};

export function sessionIdFromNewResult(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error("session/new 没有返回 sessionId");
  return sid;
}

export function isPromptStopResult(result: unknown): boolean {
  return !!result && typeof result === "object" && "stopReason" in result;
}

export function shouldClearBusyOnPromptResult(result: unknown, hadLiveWaiter: boolean): boolean {
  return hadLiveWaiter && isPromptStopResult(result);
}

export type SessionUpdateDest = "main" | "split" | "drop";

export function sessionUpdateDest(
  currentSessionId: string | null,
  splitSessionId: string | null,
  updateSessionId: string | null,
): SessionUpdateDest {
  if (isDreamSession(updateSessionId)) return "drop";
  if (splitSessionId && updateSessionId && updateSessionId === splitSessionId) return "split";
  if (!shouldKeepSessionUpdate(currentSessionId, updateSessionId)) return "drop";
  return "main";
}

export function withEchoedUser(chat: ChatState, text: string, idPrefix: string, at: number): ChatState {
  return {
    ...chat,
    items: [...chat.items, { kind: "user", id: `${idPrefix}-${chat.nextId}`, text, at }],
    nextId: chat.nextId + 1,
  };
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

export function paneAgentForEvent(
  dest: SessionUpdateDest,
  mainAgent: AgentId,
  splitAgent?: AgentId | null,
): AgentId {
  if (dest === "split") return splitAgent ?? mainAgent;
  return mainAgent;
}

export function shouldIgnoreAcpEvent(
  paneAgent: AgentId,
  eventAgent: AgentId | undefined,
): boolean {
  if (eventAgent == null) return false;
  return shouldDropAcpEvent(paneAgent, eventAgent);
}

export type AcpSplitState = { id: string; cwd: string; chat: ChatState; agentId?: AgentId };

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
  split: AcpSplitState | null;
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
  setSplit: React.Dispatch<React.SetStateAction<AcpSplitState | null>>;
  setSplitDraft: (value: string) => void;
  setSplitBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setSplitAtBottom: (value: boolean) => void;
  onOpenSplit: () => void;
  onSessionsNeedRefresh: (inbox?: string) => Promise<void>;
  setSawExit: (value: boolean) => void;
  lastActivityRef: React.MutableRefObject<number>;
  splitBusy: boolean;
  steerByDefault: boolean;
  setSessionDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  queueRef: React.MutableRefObject<QueueState>;
  splitQueueRef: React.MutableRefObject<QueueState>;
  setQueue: React.Dispatch<React.SetStateAction<QueueState>>;
  setSplitQueue: React.Dispatch<React.SetStateAction<QueueState>>;
  onLocalSlash: (cmd: CommandDef, rest: string, dest: "main" | "split") => Promise<void>;
  onCancelPermission: (target: "main" | "split") => Promise<void>;
  injectUserMemory: boolean;
  userMd: string | null;
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
  echoedSplitUser: React.MutableRefObject<boolean>;
  pendingPrompt: React.MutableRefObject<"main" | "split" | null>;
  rpc: (method: string, params: unknown, opts?: { timeoutMs?: number; dest?: "main" | "split"; agentId?: AgentId }) => Promise<unknown>;
  ensureAgent: (agentId?: AgentId) => Promise<void>;
  adoptSession: (id: string | null) => void;
  beginMainRun: (sid: string) => void;
  createAcpSession: (work: string) => Promise<string>;
  startInboxSession: () => Promise<void>;
  startNewChat: () => Promise<void>;
  startSession: (workDir?: string) => Promise<void>;
  resumeSession: (s: SessionSummary) => Promise<void>;
  openSplit: (s: SessionSummary) => Promise<void>;
  sendSlashToAgent: (text: string, dest?: "main" | "split") => Promise<void>;
  refreshUsage: (id: string, dest?: "main" | "split") => Promise<void>;
  sendPrompt: (text: string, dest?: "main" | "split") => Promise<void>;
  steerPrompt: (text: string, dest?: "main" | "split") => Promise<void>;
  queuePrompt: (text: string, dest?: "main" | "split") => void;
  submitPrompt: (text: string, dest?: "main" | "split") => void;
  altSubmit: (text: string, dest?: "main" | "split") => void;
  cancelTurn: (target?: "main" | "split") => Promise<void>;
  onDraftChange: (value: string) => void;
  injectedSessions: Set<string>;
  dismissInjectedSession: (sessionId: string) => void;
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
  const pendingRpc = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const echoedUser = useRef(false);
  const echoedSplitUser = useRef(false);
  const loadGen = useRef(0);
  const ignoreReplay = useRef(false);
  const ignoreSplitReplay = useRef(false);
  const pendingPrompt = useRef<"main" | "split" | null>(null);
  const [injectedSessions, setInjectedSessions] = useState<Set<string>>(() => new Set());
  const injectedRef = useRef(injectedSessions);
  injectedRef.current = injectedSessions;
  const startedRef = useRef(new Set<string>());
  const pendingDest = useRef(new Map<number, "main" | "split">());
  const updateCursors = useRef(new Map<string, SessionUpdateCursor>());
  const depsRef = useRef(deps);
  depsRef.current = deps;
  busyRef.current = busy;
  const selectedAgentIdRef = useRef(deps.selectedAgentId);
  selectedAgentIdRef.current = deps.selectedAgentId;
  const mainAgentIdRef = useRef<AgentId>(deps.selectedAgentId);

  function adoptSession(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
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
    opts?: { timeoutMs?: number; dest?: "main" | "split"; agentId?: AgentId },
  ): Promise<unknown> {
    const agentId = targetAgentId(opts?.agentId, selectedAgentIdRef.current);
    const id = await nextRpcId();
    if (opts?.dest) pendingDest.current.set(id, opts.dest);
    const timeoutMs = opts?.timeoutMs ?? (method === "session/prompt" ? 0 : 180000);
    return new Promise((resolve, reject) => {
      pendingRpc.current.set(id, { resolve, reject });
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
      await rpc("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "grok-build-webui", title: "Grok Build", version: "0.4.0" },
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      }, { agentId: id });
      applyWarmupFlags(id, true);
    })()
      .catch((e) => {
        delete agentBoots[id];
        applyWarmupFlags(id, false);
        throw e;
      })
      .finally(() => setConnecting(false));
    return agentBoots[id];
  }

  async function refreshUsage(id: string, dest: "main" | "split" = "main") {
    try {
      const usage = await readSessionUsage(id);
      if (!usage) return;
      if (dest === "split") {
        depsRef.current.setSplit((prev) => (prev && prev.id === id ? { ...prev, chat: { ...prev.chat, usage } } : prev));
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
      if (waiter) {
        pendingRpc.current.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      if (shouldClearBusyOnPromptResult(msg.result, hadLiveWaiter)) {
        const dest = pendingDest.current.get(id) ?? pendingPrompt.current;
        pendingDest.current.delete(id);
        if (dest === "split") d.setSplitBusy(false);
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
      const dest = sessionUpdateDest(sessionIdRef.current, d.split?.id ?? null, sid);
      if (dest === "drop") return;
      const paneAgent = paneAgentForEvent(dest, mainAgentIdRef.current, d.split?.agentId);
      if (shouldIgnoreAcpEvent(paneAgent, eventAgent)) return;
      const forSplit = dest === "split";
      if (ignoreReplay.current && !forSplit) return;
      if (forSplit && ignoreSplitReplay.current) return;
      const update = asRecord(params.update);
      const kind = String(update.sessionUpdate ?? "");
      if (kind === "turn_completed" || kind === "auto_compact_started" || kind === "auto_compact_completed") {
        const id = sid || (forSplit ? d.split?.id ?? null : sessionIdRef.current);
        if (id) void refreshUsage(id, forSplit ? "split" : "main");
      }
      if (forSplit) {
        d.setSplit((prev) => prev ? { ...prev, chat: applyChatUpdate(prev.chat, params, { skipUser: echoedSplitUser.current }) } : prev);
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
      const a = await onAcpMessage((m, eventAgent) => handleRef.current(m, eventAgent));
      const c = await onAcpStderr((line) => {
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
        depsRef.current.setSplitBusy(false);
        setConnecting(false);
        pendingPrompt.current = null;
      });
      if (cancelled) {
        a(); c(); exit();
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
    };
  }, []);

  useEffect(() => {
    const id = deps.selectedAgentId;
    const ok = isAgentReady(readyByAgentRef.current, id);
    readyRef.current = ok;
    setReady(ok);
  }, [deps.selectedAgentId]);

  async function createAcpSession(work: string): Promise<string> {
    const meta: Record<string, unknown> = {};
    if (depsRef.current.mode === "yolo") meta.yoloMode = true;
    const result = asRecord(await rpc("session/new", { cwd: work || ".", mcpServers: [], _meta: meta }));
    const sid = sessionIdFromNewResult(result);
    mainAgentIdRef.current = selectedAgentIdRef.current;
    adoptSession(sid);
    await setWorkspace(work || ".", sid);
    window.setTimeout(() => void depsRef.current.onSessionsNeedRefresh(), 500);
    return sid;
  }

  async function startInboxSession() {
    const d = depsRef.current;
    try {
      const inbox = await ensureInbox(d.inboxCwd || null);
      d.setInboxCwd(inbox);
      d.persist({ inboxCwd: inbox });
      d.setCwd(inbox);
      setChat(emptyChat());
      d.setDraft("");
      echoedUser.current = false;
      await ensureAgent();
      await setWorkspace(inbox);
      await createAcpSession(inbox);
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
    setChat(emptyChat());
    d.setDraft("");
    echoedUser.current = false;
    try {
      await ensureAgent();
      await setWorkspace(work);
      await createAcpSession(work);
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

  async function resumeSession(s: SessionSummary) {
    const d = depsRef.current;
    if (d.split?.id === s.id) {
      d.setSplit(null);
      d.setSplitDraft("");
      d.setSplitBusy(false);
    }
    const last = s.cwd === INBOX_PIN || (d.inboxCwd && sameCwd(s.cwd, d.inboxCwd)) ? INBOX_PIN : s.cwd;
    d.setLastWorkspace(last);
    d.persist({ lastWorkspace: last });
    const token = ++loadGen.current;
    if (s.cwd !== d.cwd) d.setCwd(s.cwd);
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
      const page = await readSessionUpdates(s.id, afterByteFor(updateCursors.current, s.id) ?? null);
      if (token !== loadGen.current) return;
      const next = applySessionPage(updateCursors.current, s.id, page);
      setChat(next);
      if (chatHasPromptHistory(next.items)) startedRef.current = markStarted(startedRef.current, s.id);
      void refreshUsage(s.id);
      setLoadingSession(false);
      ignoreReplay.current = true;
      try {
        const { agentId, selectedAfterOpen } = openSessionAgent(s, selectedAgentIdRef.current);
        d.setSelectedAgentId(selectedAfterOpen);
        mainAgentIdRef.current = agentId;
        await ensureAgent(agentId);
        await setWorkspace(s.cwd, s.id);
        try {
          await rpc("session/resume", { sessionId: s.id, cwd: s.cwd || undefined, mcpServers: [] }, { agentId });
        } catch {
          await rpc("session/load", { sessionId: s.id, cwd: s.cwd || undefined, mcpServers: [] }, { agentId });
        }
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

  async function openSplit(s: SessionSummary) {
    const d = depsRef.current;
    if (s.id === sessionIdRef.current) {
      d.showToast("已在当前窗口");
      return;
    }
    d.onOpenSplit();
    d.setSplitDraft("");
    d.setSplitBusy(false);
    d.setSplitAtBottom(true);
    echoedSplitUser.current = false;
    try {
      const page = await readSessionUpdates(s.id, afterByteFor(updateCursors.current, s.id) ?? null);
      const next = applySessionPage(updateCursors.current, s.id, page);
      const { agentId, selectedAfterOpen } = openSessionAgent(s, selectedAgentIdRef.current);
      d.setSelectedAgentId(selectedAfterOpen);
      d.setSplit({ id: s.id, cwd: s.cwd, chat: next, agentId });
      if (chatHasPromptHistory(next.items)) startedRef.current = markStarted(startedRef.current, s.id);
      void refreshUsage(s.id, "split");
      ignoreSplitReplay.current = true;
      try {
        await ensureAgent(agentId);
        await setWorkspace(s.cwd, s.id);
        try {
          await rpc("session/resume", { sessionId: s.id, cwd: s.cwd || undefined, mcpServers: [] }, { agentId });
        } catch {
          await rpc("session/load", { sessionId: s.id, cwd: s.cwd || undefined, mcpServers: [] }, { agentId });
        }
      } finally {
        ignoreSplitReplay.current = false;
      }
    } catch (e) {
      d.showToast(String(e));
    }
  }

  async function sendSlashToAgent(text: string, dest: "main" | "split" = "main") {
    await ensureAgent();
    if (dest === "split") {
      const sid = depsRef.current.split?.id;
      if (!sid) return;
      depsRef.current.setSplitBusy(true);
      await rpc(
        "session/prompt",
        { sessionId: sid, prompt: [{ type: "text", text }] },
        { dest: "split" },
      );
      return;
    }
    let sid = sessionIdRef.current;
    if (!sid) sid = await createAcpSession(depsRef.current.cwd || depsRef.current.inboxCwd || ".");
    beginMainRun(sid);
    await rpc(
      "session/prompt",
      { sessionId: sid, prompt: [{ type: "text", text }] },
      { dest: "main" },
    );
  }

  /**
   * Inject a message into the turn that is already running. The agent decides
   * when to read it; the tool call in flight is not cancelled. If the CLI
   * refuses a second prompt on a live session we fall back to the queue rather
   * than losing the message.
   */
  async function steerPrompt(text: string, dest: "main" | "split" = "main") {
    const d = depsRef.current;
    const sid = dest === "split" ? d.split?.id : sessionIdRef.current;
    if (!sid) {
      queuePrompt(text, dest);
      return;
    }
    const at = Date.now();
    if (dest === "split") {
      echoedSplitUser.current = true;
      d.setSplit((prev) => (prev ? { ...prev, chat: withEchoedUser(prev.chat, text, "u-steer", at) } : prev));
      d.setSplitDraft("");
    } else {
      echoedUser.current = true;
      setChat((prev) => withEchoedUser(prev, text, "u-steer", at));
      d.setDraft("");
    }
    try {
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] }, { dest });
    } catch (e) {
      d.showToast(`改向失败，已改为排队：${String(e)}`);
      queuePrompt(text, dest);
    }
  }

  function queuePrompt(text: string, dest: "main" | "split" = "main") {
    const d = depsRef.current;
    if (dest === "split") {
      const next = enqueue(d.splitQueueRef.current, text);
      if (next === d.splitQueueRef.current) {
        d.showToast("队列已满，等这一轮结束");
        return;
      }
      d.splitQueueRef.current = next;
      d.setSplitQueue(next);
      d.setSplitDraft("");
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

  function submitPrompt(text: string, dest: "main" | "split" = "main") {
    const d = depsRef.current;
    if (!text.trim()) return;
    const paneBusy = dest === "split" ? d.splitBusy : busyRef.current;
    if (!paneBusy) {
      void sendPrompt(text, dest);
      return;
    }
    if (d.steerByDefault) void steerPrompt(text, dest);
    else queuePrompt(text, dest);
  }

  function altSubmit(text: string, dest: "main" | "split" = "main") {
    if (!text.trim()) return;
    if (depsRef.current.steerByDefault) queuePrompt(text, dest);
    else void steerPrompt(text, dest);
  }

  async function sendPrompt(text: string, dest: "main" | "split" = "main") {
    const d = depsRef.current;
    const toSplit = dest === "split";
    if (!text.trim() || loadingSession) return;
    if (toSplit ? d.splitBusy : busyRef.current) return;
    if (!toSplit && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, chat.commands).find((c) => c.name === name);
      if (found?.local) {
        d.setDraft("");
        return d.onLocalSlash(found, text.slice(name.length).trimStart(), "main");
      }
    }
    if (toSplit && text.startsWith("/")) {
      const name = text.split(/\s/)[0];
      const found = filterCommands(name, d.split?.chat.commands ?? []).find((c) => c.name === name);
      if (found?.local) {
        d.setSplitDraft("");
        return d.onLocalSlash(found, text.slice(name.length).trimStart(), "split");
      }
    }
    let acpText = text;
    let wrapInjected = false;
    try {
      const sidGuess = dest === "split" ? d.split?.id : sessionIdRef.current;
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
    if (toSplit) {
      const sid = d.split?.id;
      if (!sid) return;
      const at = Date.now();
      d.setSplit((prev) => (prev ? { ...prev, chat: withEchoedUser(prev.chat, text, "u-local", at) } : prev));
      d.setSplitDraft("");
      d.setSplitBusy(true);
      d.setSplitAtBottom(true);
      echoedSplitUser.current = true;
      pendingPrompt.current = "split";
      try {
        await ensureAgent();
        if (d.split?.cwd) await setWorkspace(d.split.cwd, sid);
        await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text: acpText }] }, { dest: "split" });
        startedRef.current = markStarted(startedRef.current, sid);
        if (wrapInjected) {
          const next = markInjected(injectedRef.current, sid, true);
          injectedRef.current = next;
          setInjectedSessions(next);
        }
      } catch (e) {
        d.setSplitBusy(false);
        d.showToast(String(e));
      }
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
      await ensureAgent();
      let sid = sessionIdRef.current;
      if (!sid) sid = await createAcpSession(d.cwd || d.inboxCwd || ".");
      if (sid !== existing) beginMainRun(sid);
      if (d.cwd) await setWorkspace(d.cwd, sid);
      await rpc("session/prompt", { sessionId: sid, prompt: [{ type: "text", text: acpText }] }, { dest: "main" });
      startedRef.current = markStarted(startedRef.current, sid);
      if (wrapInjected) {
        const next = markInjected(injectedRef.current, sid, true);
        injectedRef.current = next;
        setInjectedSessions(next);
      }
    } catch (e) {
      busyRef.current = false;
      setBusy(false);
      d.showToast(String(e));
    }
  }

  function dismissInjectedSession(id: string) {
    const next = dismissInjected(injectedRef.current, id);
    injectedRef.current = next;
    setInjectedSessions(next);
  }

  async function cancelTurn(target: "main" | "split" = "main") {
    const d = depsRef.current;
    const sid = target === "split" ? d.split?.id : runningSessionIdRef.current;
    try {
      if (sid) await sendRaw({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sid } }, selectedAgentIdRef.current);
      await d.onCancelPermission(target);
    } finally {
      if (target === "split") d.setSplitBusy(false);
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
    echoedSplitUser,
    pendingPrompt,
    rpc,
    ensureAgent,
    adoptSession,
    beginMainRun,
    createAcpSession,
    startInboxSession,
    startNewChat,
    startSession,
    resumeSession,
    openSplit,
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
  };
}
