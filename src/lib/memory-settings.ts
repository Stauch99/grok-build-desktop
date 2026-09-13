import { isAgentId, type AgentId } from "./agent-id";
import { clampThresholdSessions, DEFAULT_THRESHOLD_SESSIONS } from "./memory-gates";

export type MemorySettings = {
  injectUserMemory: boolean;
  dreamingEnabled: boolean;
  dreamAgentId: AgentId;
  dreamThresholdSessions: number;
  memoryMcpEnabled: boolean;
  memoryDisplayName: string;
};

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  injectUserMemory: true,
  dreamingEnabled: true,
  dreamAgentId: "grok",
  dreamThresholdSessions: DEFAULT_THRESHOLD_SESSIONS,
  memoryMcpEnabled: true,
  memoryDisplayName: "",
};

export function parseMemorySettings(raw: unknown): MemorySettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof row.dreamAgentId === "string" && isAgentId(row.dreamAgentId) ? row.dreamAgentId : "grok";
  const threshold =
    typeof row.dreamThresholdSessions === "number" ? row.dreamThresholdSessions : DEFAULT_THRESHOLD_SESSIONS;
  return {
    injectUserMemory: row.injectUserMemory !== false,
    dreamingEnabled: row.dreamingEnabled !== false,
    dreamAgentId: id,
    dreamThresholdSessions: clampThresholdSessions(threshold),
    memoryMcpEnabled: row.memoryMcpEnabled !== false,
    memoryDisplayName: typeof row.memoryDisplayName === "string" ? row.memoryDisplayName.trim().slice(0, 40) : "",
  };
}

export function canSaveDreamAgent(id: string, loggedIn: readonly AgentId[]): id is AgentId {
  return isAgentId(id) && loggedIn.includes(id);
}
