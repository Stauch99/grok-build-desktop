import type { AgentId } from "./agent-id";
import {
  emptySessions,
  grokSessionsFromRows,
  unionSessions,
  type AdminSession,
} from "./admin-port";

export type GrokSessionRow = {
  id: string;
  cwd: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  numMessages: number;
};

export function adapterSessions(id: AgentId, grokRows: GrokSessionRow[]): AdminSession[] {
  if (id === "grok") return grokSessionsFromRows(grokRows);
  return emptySessions(id);
}

export function allAdapterSessions(grokRows: GrokSessionRow[]): AdminSession[] {
  return unionSessions([
    adapterSessions("grok", grokRows),
    adapterSessions("kimi", grokRows),
    adapterSessions("claude", grokRows),
    adapterSessions("codex", grokRows),
  ]);
}
