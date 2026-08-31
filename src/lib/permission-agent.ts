import type { AgentId } from "./agent-id";

export function permissionReplyAgent(
  agentId: AgentId | null | undefined,
  fallback: AgentId = "grok",
): AgentId {
  return agentId ?? fallback;
}
