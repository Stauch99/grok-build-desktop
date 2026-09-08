import type { SessionSummary } from "../api";
import type { AgentId } from "./agent-id";
import type { ChatItem } from "./chat";
import { childSessionIdFromToolDetail, subagentDisplayName, subagentStatusFromItem } from "./subagent";

export function liveRosterId(agentId: AgentId, toolCallId: string): string {
  return `live:${agentId}:${toolCallId}`;
}

export function isLiveRosterId(id: string): boolean {
  return id.startsWith("live:");
}

export function liveRosterFromTools(
  items: ChatItem[],
  opts: { agentId: AgentId; parentSessionId: string; cwd: string; nowIso: string },
): SessionSummary[] {
  const out: SessionSummary[] = [];
  for (const item of items) {
    if (item.kind !== "tool") continue;
    const status = subagentStatusFromItem(item, opts.agentId);
    if (!status) continue;
    const childId = childSessionIdFromToolDetail(item.detail);
    if (status !== "running" && !childId) continue;
    out.push({
      id: childId ?? liveRosterId(opts.agentId, item.id),
      parentSessionId: opts.parentSessionId,
      agentId: opts.agentId,
      sessionKind: "subagent",
      title: subagentDisplayName(item.title),
      cwd: opts.cwd,
      numMessages: 1,
      updatedAt: opts.nowIso,
      createdAt: opts.nowIso,
      toolUseId: item.id,
    });
  }
  return out;
}

export function mergeLiveRoster(base: SessionSummary[], live: SessionSummary[]): SessionSummary[] {
  const baseIds = new Set(base.map((s) => s.id));
  const out = [...base];
  for (const row of live) {
    if (baseIds.has(row.id)) continue;
    out.push(row);
  }
  return out;
}

export function sessionToOpen(clicked: SessionSummary, all: SessionSummary[]): SessionSummary {
  if (isLiveRosterId(clicked.id) && clicked.parentSessionId) {
    const toolId = clicked.id.split(":").slice(2).join(":");
    const disk = all.find(
      (s) =>
        !isLiveRosterId(s.id) &&
        s.parentSessionId === clicked.parentSessionId &&
        (s.toolUseId === toolId || s.id === toolId),
    );
    if (disk) return disk;
    const parent = all.find((s) => s.id === clicked.parentSessionId);
    if (parent) return parent;
  }
  return clicked;
}

export function lookupSession(id: string, all: SessionSummary[]): SessionSummary | null {
  const found = all.find((s) => s.id === id) ?? null;
  if (!found) return null;
  return sessionToOpen(found, all);
}

export function liveBusyIds(sessions: SessionSummary[]): string[] {
  return sessions.filter((s) => isLiveRosterId(s.id)).map((s) => s.id);
}

export function runningChildSessionIds(items: ChatItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind !== "tool") continue;
    if (subagentStatusFromItem(item) !== "running") continue;
    const id = childSessionIdFromToolDetail(item.detail);
    if (id) out.push(id);
  }
  return out;
}

export function parentsToExpandForLive(sessions: SessionSummary[]): string[] {
  const parents = new Set<string>();
  for (const s of sessions) {
    if (isLiveRosterId(s.id) && s.parentSessionId) {
      parents.add(s.parentSessionId);
    }
  }
  return [...parents];
}

/** Live children must not override the count-circle collapse. */
export function applyLiveParentExpand(
  collapsed: Set<string>,
  expanded: Set<string>,
  _liveParentIds: string[],
): { collapsed: Set<string>; expanded: Set<string> } {
  return { collapsed, expanded };
}

export function sessionsWithLiveRoster(
  base: SessionSummary[],
  items: ChatItem[],
  opts: { agentId: AgentId; parentSessionId: string | null; cwd: string; nowIso: string },
): SessionSummary[] {
  if (!opts.parentSessionId) return base;
  return mergeLiveRoster(
    base,
    liveRosterFromTools(items, { ...opts, parentSessionId: opts.parentSessionId }),
  );
}
