import type { AgentId } from "./agent-id";
import { stampSessionAgent } from "./session-agent";

export function brandSessionList<T extends { id: string; agentId?: string | null }>(
  rows: T[],
): Array<T & { agentId: AgentId }> {
  return rows.map((row) => stampSessionAgent(row));
}
