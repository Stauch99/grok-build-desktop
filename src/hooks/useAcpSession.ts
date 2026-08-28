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
  applyChatUpdate,
  emptyChat,
  hydrateFromUpdates,
  shouldKeepSessionUpdate,
  type ChatState,
} from "../lib/chat";
import { sameCwd } from "../lib/inbox";
import type { Mode } from "../lib/mode";
import { INBOX_PIN, projectForSession, resolveLastWorkspace } from "../lib/sidebar-list";
import { getDraft } from "../lib/session-drafts";
import { clearUnread, markUnread, type UnreadMap } from "../lib/session-status";
import { asRecord, surfaceStderr } from "../lib/text";

export function sessionIdFromNewResult(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error("session/new 没有返回 sessionId");
  return sid;
}

export function isPromptStopResult(result: unknown): boolean {
  return !!result && typeof result === "object" && "stopReason" in result;
}

export type SessionUpdateDest = "main" | "split" | "drop";

export function sessionUpdateDest(
  currentSessionId: string | null,
  splitSessionId: string | null,
  updateSessionId: string | null,
): SessionUpdateDest {
  if (splitSessionId && updateSessionId && updateSessionId === splitSessionId) return "split";
  if (!shouldKeepSessionUpdate(currentSessionId, updateSessionId)) return "drop";
  return "main";
}

export type AcpSplitState = { id: string; cwd: string; chat: ChatState };

export type AcpSessionDeps = {
  cwd: string;
  inboxCwd: string;
  projects: string[];
  lastWorkspace: string;
  mode: Mode;
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
  rpc: (method: string, params: unknown, opts?: { timeoutMs?: number; dest?: "main" | "split" }) => Promise<unknown>;
  ensureAgent: () => Promise<void>;
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
  const busyRef = useRef(false);
  const ensurePromise = useRef<Promise<void> | null>(null);
  const pendingRpc = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const echoedUser = useRef(false);
  const echoedSplitUser = useRef(false);
  const loadGen = useRef(0);
  const ignoreReplay = useRef(false);
  const ignoreSplitReplay = useRef(false);
  const pendingPrompt = useRef<"main" | "split" | null>(null);
  const pendingDest = useRef(new Map<number, "main" | "split">());
  const depsRef = useRef(deps);
  depsRef.current = deps;
  busyRef.current = busy;

  function adoptSession(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
  }

  function beginMainRun(sid: string) {
    runningSessionIdRef.current = sid;
    setRunningSessionId(sid);
    setBusy(true);
  }

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
      depsRef.current.setSawExit(false);
    })()
      .catch((e) => {
        ensurePromise.current = null;
        throw e;
      })
      .finally(() => setConnecting(false));
    return ensurePromise.current;
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

  function handleRpcMessage(msg: JsonRpc) {
    const d = depsRef.current;
    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const id = Number(msg.id);
      const waiter = pendingRpc.current.get(id);
      if (waiter) {
        pendingRpc.current.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      if (isPromptStopResult(msg.result)) {
        const dest = pendingDest.current.get(id) ?? pendingPrompt.current;
        pendingDest.current.delete(id);
        if (dest === "split") d.setSplitBusy(false);
        else setBusy(false);
        pendingPrompt.current = null;
      }
    }
    if (msg.method === "session/update" || msg.method === "_x.ai/session/update") {
      const params = asRecord(msg.params);
      const sid = typeof params.sessionId === "string" ? params.sessionId : null;
      const dest = sessionUpdateDest(sessionIdRef.current, d.split?.id ?? null, sid);
      if (dest === "drop") return;
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
      const a = await onAcpMessage((m) => handleRef.current(m));
      const c = await onAcpStderr((line) => {
        const msg = surfaceStderr(line);
        if (msg) depsRef.current.showToast(msg);
      });
      const exit = await onAgentExit(() => {
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
        ensurePromise.current = null;
      });
      if (cancelled) {
        a(); c(); exit();
        return;
      }
      offs.push(a, c, exit);
    })();
    return () => {
      cancelled = true;
      offs.forEach((fn) => fn());
    };
  }, []);

  async function createAcpSession(work: string): Promise<string> {
    const meta: Record<string, unknown> = {};
    if (depsRef.current.mode === "yolo") meta.yoloMode = true;
    const result = asRecord(await rpc("session/new", { cwd: work || ".", mcpServers: [], _meta: meta }));
    const sid = sessionIdFromNewResult(result);
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
      const rows = await readSessionUpdates(s.id);
      const next = hydrateFromUpdates(rows);
      d.setSplit({ id: s.id, cwd: s.cwd, chat: next });
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
  };
}
