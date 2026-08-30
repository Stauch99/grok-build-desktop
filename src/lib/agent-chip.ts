import type { AgentId } from "./agent-id";
import { canChangeSelectedAgent } from "./session-agent";

export function agentChipDisabled(hasOpenSession: boolean): boolean {
  return !canChangeSelectedAgent(hasOpenSession);
}

export function agentChipLabel(id: AgentId): string {
  return id === "grok" ? "Grok" : id === "kimi" ? "Kimi" : id === "claude" ? "Claude" : "Codex";
}

export function agentChipClassName(id: AgentId, value: AgentId): string {
  return `agent-chip agent-chip-${id}${id === value ? " active" : ""}`;
}

export function connectingBannerText(id: AgentId): string {
  return `正在连接 ${agentChipLabel(id)} agent…`;
}

export function restartAgentBannerText(id: AgentId): string {
  return `重启 ${agentChipLabel(id)} agent`;
}
