export type AgentId = "grok" | "kimi" | "claude" | "codex";

export const AGENT_IDS = ["grok", "kimi", "claude", "codex"] as const;

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

export type SessionRef = { agentId: AgentId; sessionId: string };

export function sessionRefKey(ref: SessionRef): string {
  return `${ref.agentId}/${ref.sessionId}`;
}

export function parseSessionRefKey(key: string): SessionRef | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash < 0) {
    return { agentId: "grok", sessionId: trimmed };
  }
  const agent = trimmed.slice(0, slash);
  const sessionId = trimmed.slice(slash + 1);
  if (!sessionId || !isAgentId(agent)) return null;
  return { agentId: agent, sessionId };
}
