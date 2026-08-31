import { isAgentId, type AgentId } from "./agent-id";
import { unwrapAcpEvent } from "./acp-event-tag";

export function resolveStartAgentId(agentId?: string | null): AgentId {
  const trimmed = (agentId ?? "").trim();
  if (!trimmed) return "grok";
  if (!isAgentId(trimmed)) throw new Error(`未知 agent: ${trimmed}`);
  return trimmed;
}

export function acpMessageFromEvent(raw: unknown): { agentId: AgentId; payload: unknown } {
  const tagged = unwrapAcpEvent(raw);
  return { agentId: tagged.agentId, payload: tagged.payload };
}

export function stderrFromAcpEvent(raw: unknown): { line: string; agentId: AgentId } {
  if (typeof raw === "string") {
    return { line: raw, agentId: "grok" };
  }
  const ev = acpMessageFromEvent(raw);
  const inner = ev.payload;
  const line = typeof inner === "string" ? inner : inner == null ? "" : String(inner);
  return { line, agentId: ev.agentId };
}

export function shouldDropAcpEvent(paneAgent: AgentId, eventAgent: AgentId): boolean {
  return paneAgent !== eventAgent;
}
