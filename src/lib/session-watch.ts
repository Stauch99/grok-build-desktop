import type { AgentId } from "./agent-id";
import type { ChatItem } from "./chat";
import { childSessionIdFromToolDetail, subagentStatusFromItem } from "./subagent";
import { asRecord } from "./text";

const LIVE_WORK = new Set(["agent_message_chunk", "agent_thought_chunk", "tool_call"]);
const DONE_TOOL = new Set(["completed", "complete", "success", "failed", "cancelled", "canceled"]);

export type SpawnWatch = {
  childrenOf: Record<string, string[]>;
  parentOf: Record<string, string>;
};

export function emptySpawnWatch(): SpawnWatch {
  return { childrenOf: {}, parentOf: {} };
}

export function spawnedChildIds(items: ChatItem[], agentId?: AgentId): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind !== "tool") continue;
    if (!subagentStatusFromItem(item, agentId)) continue;
    const id = childSessionIdFromToolDetail(item.detail);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function newlySpawnedChildIds(
  watch: SpawnWatch,
  parentId: string,
  items: ChatItem[],
  agentId?: AgentId,
): string[] {
  const known = new Set(watch.childrenOf[parentId] ?? []);
  return spawnedChildIds(items, agentId).filter((id) => !known.has(id));
}

export function rememberSpawnedChildren(
  watch: SpawnWatch,
  parentId: string,
  items: ChatItem[],
  agentId?: AgentId,
): SpawnWatch {
  const ids = spawnedChildIds(items, agentId);
  if (ids.length === 0) return watch;
  const merged = [...(watch.childrenOf[parentId] ?? [])];
  const childrenOf = { ...watch.childrenOf };
  const parentOf = { ...watch.parentOf };
  for (const id of ids) {
    if (!merged.includes(id)) merged.push(id);
    parentOf[id] = parentId;
  }
  childrenOf[parentId] = merged;
  return { childrenOf, parentOf };
}

export function parentBusyIds(watch: SpawnWatch, runningIds: readonly string[]): string[] {
  const live = new Set(runningIds);
  const parents: string[] = [];
  for (const [parent, children] of Object.entries(watch.childrenOf)) {
    if (children.some((id) => live.has(id)) && !parents.includes(parent)) parents.push(parent);
  }
  return parents;
}

export function watchedSessionIds(runningIds: readonly string[], watch: SpawnWatch): string[] {
  const out = new Set(runningIds);
  for (const parent of Object.keys(watch.childrenOf)) out.add(parent);
  for (const child of Object.keys(watch.parentOf)) out.add(child);
  return [...out];
}

export function shouldSettleRunning(opts: {
  sessionId: string;
  runningIds: readonly string[];
  watch: SpawnWatch;
  openTools?: boolean;
  promptPending?: boolean;
}): boolean {
  if (opts.promptPending) return false;
  if (opts.openTools) return false;
  const children = opts.watch.childrenOf[opts.sessionId];
  if (children?.some((id) => opts.runningIds.includes(id))) return false;
  return true;
}

export function sessionUpdateKind(params: Record<string, unknown>): string {
  const update = params.update ? asRecord(params.update) : params;
  return String(update.sessionUpdate ?? "");
}

export function shouldMarkRunningOnSessionUpdate(params: Record<string, unknown>): boolean {
  const update = params.update ? asRecord(params.update) : params;
  const kind = String(update.sessionUpdate ?? "");
  if (LIVE_WORK.has(kind)) return true;
  if (kind !== "tool_call_update") return false;
  const status = String(update.status ?? "").toLowerCase();
  if (!status) return true;
  return !DONE_TOOL.has(status);
}

export function shouldStashBackgroundChat(opts: {
  sessionId: string | null;
  items: ChatItem[];
  runningIds: readonly string[];
  watch: SpawnWatch;
}): boolean {
  const sid = opts.sessionId;
  if (!sid) return false;
  if (opts.runningIds.includes(sid)) return true;
  if ((opts.watch.childrenOf[sid] ?? []).length > 0) return true;
  if (spawnedChildIds(opts.items).length > 0) return true;
  return false;
}

export function parentIdFromSummaries(
  sessions: readonly { id: string; parentSessionId?: string | null }[],
  sessionId: string,
): string | null {
  const row = sessions.find((s) => s.id === sessionId);
  const parent = row?.parentSessionId;
  return parent || null;
}

export function rememberDiskChild(watch: SpawnWatch, parentId: string, childId: string): SpawnWatch {
  if (!parentId || !childId || parentId === childId) return watch;
  if (watch.parentOf[childId] === parentId) return watch;
  const merged = [...(watch.childrenOf[parentId] ?? [])];
  if (!merged.includes(childId)) merged.push(childId);
  return {
    childrenOf: { ...watch.childrenOf, [parentId]: merged },
    parentOf: { ...watch.parentOf, [childId]: parentId },
  };
}

export function forgetSettledSpawn(
  watch: SpawnWatch,
  parentId: string,
  runningIds: readonly string[],
): SpawnWatch {
  const children = watch.childrenOf[parentId];
  if (!children) return watch;
  if (runningIds.includes(parentId)) return watch;
  if (children.some((id) => runningIds.includes(id))) return watch;
  const childrenOf = { ...watch.childrenOf };
  delete childrenOf[parentId];
  const parentOf = { ...watch.parentOf };
  for (const child of children) {
    if (parentOf[child] === parentId) delete parentOf[child];
  }
  return { childrenOf, parentOf };
}
