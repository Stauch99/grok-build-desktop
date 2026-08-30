import { isAgentId, type AgentId } from "./agent-id";

export type TaggedAcpEvent = {
  agentId: AgentId;
  generation: number;
  payload: unknown;
};

export function wrapAcpEvent(
  agentId: AgentId,
  generation: number,
  payload: unknown,
): TaggedAcpEvent {
  return { agentId, generation, payload };
}

export function unwrapAcpEvent(raw: unknown): TaggedAcpEvent {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.agentId === "string" && isAgentId(o.agentId) && "payload" in o) {
      return {
        agentId: o.agentId,
        generation: typeof o.generation === "number" ? o.generation : 0,
        payload: o.payload,
      };
    }
  }
  return { agentId: "grok", generation: 0, payload: raw };
}
