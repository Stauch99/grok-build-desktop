import type { SessionSummary } from "../api";
import type { AgentId } from "./agent-id";
import type { ChatItem } from "./chat";
import { isLiveRosterId, liveRosterId } from "./live-roster";
import { subagentDisplayName, subagentStatusFromItem, type SubagentStatus } from "./subagent";

export function subagentCatalog(
  items: ChatItem[],
  agentId?: AgentId,
): Array<{ id: string; name: string; status: SubagentStatus }> {
  const out: Array<{ id: string; name: string; status: SubagentStatus }> = [];
  for (const it of items) {
    if (it.kind !== "tool") continue;
    const status = subagentStatusFromItem(it, agentId);
    if (!status) continue;
    const name = subagentDisplayName(it.title);
    out.push({ id: it.id, name, status });
  }
  return out;
}

export function resolveSubagentSession(
  toolId: string,
  sessions: SessionSummary[],
  opts: { parentSessionId: string | null; agentId: AgentId },
): SessionSummary | null {
  const parent = opts.parentSessionId;
  if (parent) {
    const child = sessions.find((s) => s.parentSessionId === parent && s.toolUseId === toolId);
    if (child) return child;
  }
  return sessions.find((s) => s.id === liveRosterId(opts.agentId, toolId)) ?? null;
}

export type SubagentChipModel = {
  id: string;
  name: string;
  status: SubagentStatus;
  sessionId: string | null;
};

export function subagentChips(
  items: ChatItem[],
  sessions: SessionSummary[],
  opts: { parentSessionId: string | null; agentId: AgentId },
): SubagentChipModel[] {
  const chips = subagentCatalog(items, opts.agentId).map((row) => {
    const session = resolveSubagentSession(row.id, sessions, opts);
    const title = session?.title?.trim();
    const named = title && title !== session?.id ? title : row.name;
    const sessionId = session && !isLiveRosterId(session.id) ? session.id : null;
    return { id: row.id, name: named, status: row.status, sessionId };
  });
  return uniqueSubagentChips(chips);
}

export function uniqueSubagentChips(chips: SubagentChipModel[]): SubagentChipModel[] {
  const seen = new Set<string>();
  const out: SubagentChipModel[] = [];
  for (const chip of chips) {
    const key = chip.sessionId ?? `tool:${chip.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
}
