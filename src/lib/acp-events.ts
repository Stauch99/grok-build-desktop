export type AcpSessionUpdate =
  | { sessionUpdate: "user_message_chunk"; content?: unknown; _meta?: unknown }
  | { sessionUpdate: "agent_message_chunk"; content?: unknown; _meta?: unknown }
  | { sessionUpdate: "agent_thought_chunk"; content?: unknown }
  | { sessionUpdate: "tool_call"; toolCallId?: string; [k: string]: unknown }
  | { sessionUpdate: "tool_call_update"; toolCallId?: string; [k: string]: unknown }
  | { sessionUpdate: "plan"; [k: string]: unknown }
  | { sessionUpdate: "available_commands_update"; [k: string]: unknown }
  | { sessionUpdate: "current_mode_update"; [k: string]: unknown }
  | { sessionUpdate: "session_info_update"; [k: string]: unknown }
  | { sessionUpdate: "turn_completed"; [k: string]: unknown }
  | { sessionUpdate: string; [k: string]: unknown };

export type AcpRecord = { update?: AcpSessionUpdate; _ts?: number; params?: unknown; [k: string]: unknown };

export function parseAcpRecord(raw: unknown): AcpRecord | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as AcpRecord;
}
