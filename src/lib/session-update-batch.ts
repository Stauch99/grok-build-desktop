import { applyChatUpdate, isBusyNoiseTool, turnHasOpenTools, type ApplyOptions, type ChatItem, type ChatState } from "./chat";
import { asRecord } from "./text";

const FLUSH_NOW = new Set([
  "turn_completed",
  "auto_compact_started",
  "auto_compact_completed",
]);

export function foldSessionUpdates(
  prev: ChatState,
  batch: Record<string, unknown>[],
  opts?: ApplyOptions,
): ChatState {
  if (batch.length === 0) return prev;
  return batch.reduce<ChatState>((chat, params) => applyChatUpdate(chat, params, opts), prev);
}

export function shouldFlushSessionUpdateNow(params: Record<string, unknown>): boolean {
  const update = params.update ? asRecord(params.update) : params;
  return FLUSH_NOW.has(String(update.sessionUpdate ?? ""));
}

/** Resume working chrome when the agent produces work after the UI had gone idle. */
export function shouldResumeBusyOnSessionUpdate(
  params: Record<string, unknown>,
  items?: ChatItem[],
): boolean {
  const update = params.update ? asRecord(params.update) : params;
  const kind = String(update.sessionUpdate ?? "");
  if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") return true;
  if (kind !== "tool_call" && kind !== "tool_call_update") return false;
  const title = String(update.title ?? "");
  const toolName =
    typeof update.toolName === "string"
      ? update.toolName
      : typeof update.kind === "string"
        ? update.kind
        : undefined;
  if (isBusyNoiseTool(title, toolName)) return false;
  const toolCallId = typeof update.toolCallId === "string" ? update.toolCallId : "";
  if (items && toolCallId) {
    const existing = items.find((it): it is Extract<ChatItem, { kind: "tool" }> => it.kind === "tool" && it.id === toolCallId);
    if (existing && isBusyNoiseTool(existing.title, existing.toolName)) return false;
  }
  if (kind === "tool_call") return true;
  const status = String(update.status ?? "").toLowerCase();
  if (!status) return true;
  return status === "pending" || status === "in_progress" || status === "running";
}

/** Kimi (and others) may stream the reply and emit `turn_completed` without a prompt `stopReason`. */
export function shouldClearBusyOnSessionUpdate(
  params: Record<string, unknown>,
  items?: ChatItem[],
): boolean {
  const update = params.update ? asRecord(params.update) : params;
  if (String(update.sessionUpdate ?? "") !== "turn_completed") return false;
  if (items && turnHasOpenTools(items)) return false;
  return true;
}

/** One animation frame, or a microtask when rAF is missing (Node tests). */
export function scheduleSessionUpdateFlush(apply: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(() => apply());
    return () => cancelAnimationFrame(id);
  }
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) apply();
  });
  return () => {
    cancelled = true;
  };
}
