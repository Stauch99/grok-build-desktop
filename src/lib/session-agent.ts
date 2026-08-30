import { isAgentId, type AgentId } from "./agent-id";

export function stampSessionAgent<T extends { id: string; agentId?: string | null }>(
  s: T,
  fallback: AgentId = "grok",
): T & { agentId: AgentId } {
  const agentId = s.agentId && isAgentId(s.agentId) ? s.agentId : fallback;
  return { ...s, agentId };
}

export function agentIdOfSession(s: { agentId?: string | null }): AgentId {
  return stampSessionAgent({ id: "_", agentId: s.agentId }).agentId;
}

/** 打开已有会话：chip 必须跟着走。新建空 composer 才用 chip。 */
export function selectedAgentAfterOpen(
  sessionAgent: AgentId,
  _currentChip: AgentId,
): AgentId {
  return sessionAgent;
}

export function canChangeSelectedAgent(hasOpenSession: boolean): boolean {
  return !hasOpenSession;
}

export function nextSelectedAgent(
  hasOpenSession: boolean,
  current: AgentId,
  requested: AgentId,
): AgentId {
  return canChangeSelectedAgent(hasOpenSession) ? requested : current;
}
