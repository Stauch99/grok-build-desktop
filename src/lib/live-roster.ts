import type { SessionSummary } from "../api";
import type { AgentId } from "./agent-id";
import type { ChatItem } from "./chat";
import { subagentDisplayName, subagentStatusFromTool } from "./subagent";

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
    if (subagentStatusFromTool(item.title, item.status, opts.agentId) !== "running") continue;
    out.push({
      id: liveRosterId(opts.agentId, item.id),
      parentSessionId: opts.parentSessionId,
      agentId: opts.agentId,
      sessionKind: "subagent",
      title: subagentDisplayName(item.title),
      cwd: opts.cwd,
      numMessages: 1,
      updatedAt: opts.nowIso,
      createdAt: opts.nowIso,
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

export function parentsToExpandForLive(sessions: SessionSummary[]): string[] {
  const parents = new Set<string>();
  for (const s of sessions) {
    if (isLiveRosterId(s.id) && s.parentSessionId) {
      parents.add(s.parentSessionId);
    }
  }
  return [...parents];
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
