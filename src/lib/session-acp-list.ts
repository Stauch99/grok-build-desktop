import type { SessionSummary } from "../api";
import type { AgentId } from "./agent-id";
import { asRecord } from "./text";

function sessionKey(s: { id: string; agentId?: string | null }): string {
  return `${s.agentId ?? ""}/${s.id}`;
}

function listedRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const sessions = asRecord(result).sessions;
  return Array.isArray(sessions) ? sessions : [];
}

function stringField(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function mapOne(raw: unknown, agentId: AgentId): SessionSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = stringField(rec, "sessionId", "id");
  if (!id) return null;
  const meta = asRecord(rec._meta);
  const messageCount = meta.messageCount;
  return {
    id,
    cwd: typeof rec.cwd === "string" ? rec.cwd : "",
    title: stringField(rec, "title") || id,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : "",
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : "",
    numMessages: typeof messageCount === "number" ? messageCount : 1,
    agentId,
  };
}

/** True only if `agentCapabilities.sessionCapabilities.list` is an object or `true`. */
export function sessionListAdvertised(initializeResult: unknown): boolean {
  const list = asRecord(asRecord(asRecord(initializeResult).agentCapabilities).sessionCapabilities).list;
  if (list === true) return true;
  return !!list && typeof list === "object";
}

export function mapAcpListedSessions(result: unknown, agentId: AgentId): SessionSummary[] {
  const out: SessionSummary[] = [];
  for (const raw of listedRows(result)) {
    const row = mapOne(raw, agentId);
    if (row) out.push(row);
  }
  return out;
}

/** ACP row wins on the same `id`+`agentId`. Disk rows with no ACP match stay. */
export function unionSessionsById(disk: SessionSummary[], acp: SessionSummary[]): SessionSummary[] {
  const map = new Map<string, SessionSummary>();
  for (const row of disk) map.set(sessionKey(row), row);
  for (const row of acp) map.set(sessionKey(row), row);
  return [...map.values()];
}

export async function maybeFetchAcpSessionList(args: {
  initializeResult: unknown;
  agentId: AgentId;
  rpc: (method: string, params: unknown, opts: { agentId: AgentId }) => Promise<unknown>;
}): Promise<SessionSummary[] | null> {
  if (!sessionListAdvertised(args.initializeResult)) return null;
  const result = await args.rpc("session/list", {}, { agentId: args.agentId });
  return mapAcpListedSessions(result, args.agentId);
}
