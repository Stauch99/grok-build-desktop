import type { AgentId } from "./agent-id";
import { canChangeSelectedAgent } from "./session-agent";

export function agentChipDisabled(hasOpenSession: boolean): boolean {
  return !canChangeSelectedAgent(hasOpenSession);
}

export function agentChipLabel(id: AgentId): string {
  return id === "grok" ? "Grok" : id === "kimi" ? "Kimi" : id === "claude" ? "Claude" : "Codex";
}
