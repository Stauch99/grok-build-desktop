import type { AgentId } from "./agent-id";
import { compareByUpdatedAtDesc } from "./session-time";

export type AdminSession = {
  agentId: AgentId;
  id: string;
  cwd: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  numMessages: number;
};

export function unionSessions(groups: AdminSession[][]): AdminSession[] {
  return groups.flat().sort(compareByUpdatedAtDesc);
}

export function emptySessions(_id: AgentId): AdminSession[] {
  return [];
}

export function grokSessionsFromRows(
  rows: Array<{
    id: string;
    cwd: string;
    title: string;
    updatedAt: string;
    createdAt: string;
    numMessages: number;
  }>,
): AdminSession[] {
  return rows.map((row) => ({ ...row, agentId: "grok" }));
}
