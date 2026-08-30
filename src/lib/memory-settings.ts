import { isAgentId, type AgentId } from "./agent-id";

export type MemorySettings = {
  injectUserMemory: boolean;
  dreamingEnabled: boolean;
  dreamAgentId: AgentId;
};

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  injectUserMemory: true,
  dreamingEnabled: true,
  dreamAgentId: "grok",
};

export function parseMemorySettings(raw: unknown): MemorySettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof row.dreamAgentId === "string" && isAgentId(row.dreamAgentId) ? row.dreamAgentId : "grok";
  return {
    injectUserMemory: row.injectUserMemory !== false,
    dreamingEnabled: row.dreamingEnabled !== false,
    dreamAgentId: id,
  };
}

export function canSaveDreamAgent(id: string, loggedIn: readonly AgentId[]): id is AgentId {
  return isAgentId(id) && loggedIn.includes(id);
}
