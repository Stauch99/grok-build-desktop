import type { AgentId } from "../lib/agent-id";
import { agentIdOfSession, selectedAgentAfterOpen } from "../lib/session-agent";

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
