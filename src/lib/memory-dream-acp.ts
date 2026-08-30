import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { nextRpcId, sendRaw, setWorkspace, startAgent, type JsonRpc } from "../api";
import { acpMessageFromEvent, shouldDropAcpEvent } from "./acp-host";
import type { AgentId } from "./agent-id";
import { asRecord, textFromContent } from "./text";
import { onTaggedAcpRequest } from "./workbench-api";

const RPC_TIMEOUT_MS = 180_000;
const PROMPT_TIMEOUT_MS = 10 * 60 * 1000;

export function unwrapFence(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, "");
  const m = trimmed.match(/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n?$/);
  if (!m) return trimmed;
  return m[1].endsWith("\n") ? m[1] : `${m[1]}\n`;
}

export function appendDreamsAppendix(existing: string, appendix: string): string {
  const a = unwrapFence(appendix).trim();
  if (!a) return existing;
  const body = a.endsWith("\n") ? a : `${a}\n`;
  if (!existing.trim()) return body;
  return existing.replace(/\s*$/, "\n\n") + body;
}

export function dreamAssistantDelta(msg: { method?: string; params?: unknown }, sessionId: string): string | null {
  const method = String(msg.method ?? "");
  if (method !== "session/update" && method !== "_x.ai/session/update") return null;
  const params = asRecord(msg.params);
  const sid = typeof params.sessionId === "string" ? params.sessionId : "";
  if (sid !== sessionId) return null;
  const update = asRecord(params.update);
  if (String(update.sessionUpdate) !== "agent_message_chunk") return null;
  const text = textFromContent(update.content);
  return text || null;
}

export function loggedInAgentIds(doctors: readonly { agentId: AgentId; authPresent: boolean }[]): AgentId[] {
  return doctors.filter((d) => d.authPresent).map((d) => d.agentId);
}

function sessionIdFromNew(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error("session/new 没有返回 sessionId");
  return sid;
}

export type DreamAcpHandle = {
  sessionId: string;
  prompt: (text: string) => Promise<string>;
  close: () => Promise<void>;
};

export async function openDreamAcp(opts: {
  agentId: AgentId;
  memoryRoot: string;
  alreadyRunning: boolean;
}): Promise<DreamAcpHandle> {
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let sessionId = "";
  let buffer = "";
  const offs: UnlistenFn[] = [];

  const handleMsg = (msg: JsonRpc) => {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const waiter = pending.get(Number(msg.id));
      if (waiter) {
        pending.delete(Number(msg.id));
        if (msg.error) waiter.reject(new Error(msg.error.message || "rpc error"));
        else waiter.resolve(msg.result);
      }
      return;
    }
    if (msg.method && msg.id != null) {
      const params = asRecord(msg.params);
      const sid = typeof params.sessionId === "string" ? params.sessionId : "";
      if (sid && sid === sessionId && String(msg.method).includes("permission")) {
        void sendRaw(
          { jsonrpc: "2.0", id: msg.id, result: { outcome: { outcome: "cancelled" } } },
          opts.agentId,
        );
      }
      return;
    }
    if (!sessionId) return;
    const delta = dreamAssistantDelta(msg, sessionId);
    if (delta) buffer += delta;
  };

  const onEvent = (raw: unknown) => {
    const tagged = acpMessageFromEvent(raw);
    if (shouldDropAcpEvent(opts.agentId, tagged.agentId)) return;
    handleMsg(tagged.payload as JsonRpc);
  };

  offs.push(await listen("acp-message", (e) => onEvent(e.payload)));
  offs.push(
    await onTaggedAcpRequest((eventAgent, msg) => {
      if (shouldDropAcpEvent(opts.agentId, eventAgent)) return;
      handleMsg(msg as JsonRpc);
    }),
  );

  const rpc = async (method: string, params: unknown, timeoutMs: number): Promise<unknown> => {
    const id = await nextRpcId();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      void sendRaw({ jsonrpc: "2.0", id, method, params }, opts.agentId).catch((e) => {
        pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
      if (timeoutMs > 0) {
        window.setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`${method} 超时`));
          }
        }, timeoutMs);
      }
    });
  };

  const dispose = () => {
    offs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    offs.length = 0;
  };

  try {
    if (!opts.alreadyRunning) {
      await startAgent(opts.agentId);
      await rpc(
        "initialize",
        {
          protocolVersion: 1,
          clientInfo: { name: "grok-build-webui", title: "Grok Build", version: "0.4.0" },
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
        },
        RPC_TIMEOUT_MS,
      ).catch(() => undefined);
    }
    const created = await rpc("session/new", { cwd: opts.memoryRoot || ".", mcpServers: [] }, RPC_TIMEOUT_MS);
    sessionId = sessionIdFromNew(created);
    await setWorkspace(opts.memoryRoot || ".", sessionId);
  } catch (e) {
    dispose();
    throw e instanceof Error ? e : new Error(String(e));
  }

  return {
    sessionId,
    async prompt(text: string) {
      buffer = "";
      await rpc("session/prompt", { sessionId, prompt: [{ type: "text", text }] }, PROMPT_TIMEOUT_MS);
      return unwrapFence(buffer);
    },
    async close() {
      try {
        if (sessionId) {
          await sendRaw({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } }, opts.agentId);
        }
      } catch {
        /* leave idle */
      } finally {
        dispose();
      }
    },
  };
}
