import type { SessionSummary } from "../api";
import type { AgentId } from "./agent-id";
import { clipSessionTitle, isUntitledSessionTitle } from "./session-title";
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
  const parentSessionId =
    stringField(rec, "parentSessionId") || stringField(meta, "parentSessionId") || undefined;
  return {
    id,
    cwd: typeof rec.cwd === "string" ? rec.cwd : "",
    title: stringField(rec, "title") || id,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : "",
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : "",
    numMessages: typeof messageCount === "number" ? messageCount : 1,
    agentId,
    ...(parentSessionId ? { parentSessionId } : {}),
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

/** Placeholder until Claude/Codex jsonl shows up in the disk scan. */
export function createdSessionSummary(args: {
  id: string;
  cwd: string;
  agentId: AgentId;
  nowIso?: string;
  model?: string;
  title?: string;
}): SessionSummary {
  const ts = args.nowIso ?? new Date().toISOString();
  return {
    id: args.id,
    cwd: args.cwd,
    title: clipSessionTitle(args.title ?? ""),
    updatedAt: ts,
    createdAt: ts,
    numMessages: 1,
    agentId: args.agentId,
    ...(args.model?.trim() ? { model: args.model.trim() } : {}),
  };
}

export function rememberCreatedSession(
  created: SessionSummary[],
  row: SessionSummary,
): SessionSummary[] {
  const key = sessionKey(row);
  return [...created.filter((s) => sessionKey(s) !== key), row];
}

function overlayCreatedSessions(base: SessionSummary[], created: SessionSummary[]): SessionSummary[] {
  const byKey = new Map(created.map((s) => [sessionKey(s), s]));
  const rows = base.map((row) => {
    const placeholder = byKey.get(sessionKey(row));
    if (!placeholder) return row;
    const cwd = !(row.cwd ?? "").trim() ? placeholder.cwd : row.cwd;
    const title =
      isUntitledSessionTitle(row.id, row.title) && !isUntitledSessionTitle(placeholder.id, placeholder.title)
        ? placeholder.title
        : row.title;
    const model = !(row.model ?? "").trim() ? placeholder.model : row.model;
    if (cwd === row.cwd && title === row.title && model === row.model) return row;
    return { ...row, cwd, title, ...(model ? { model } : {}) };
  });
  const keys = new Set(rows.map(sessionKey));
  const extra = created.filter((s) => !keys.has(sessionKey(s)));
  return extra.length ? [...rows, ...extra] : rows;
}

function pruneCreatedSessions(created: SessionSummary[], listed: SessionSummary[]): SessionSummary[] {
  const byKey = new Map(listed.map((s) => [sessionKey(s), s]));
  return created.filter((s) => {
    const row = byKey.get(sessionKey(s));
    if (!row) return true;
    if (isUntitledSessionTitle(row.id, row.title)) return true;
    return !!(s.model?.trim() && !(row.model ?? "").trim());
  });
}

/** Disk + ACP, plus just-created rows whose vendor title has not landed yet. */
export function catalogSessions(args: {
  disk: SessionSummary[];
  acp: SessionSummary[];
  created: SessionSummary[];
}): { rows: SessionSummary[]; created: SessionSummary[] } {
  const unioned = unionSessionsById(args.disk, args.acp);
  const leftover = pruneCreatedSessions(args.created, unioned);
  return { rows: overlayCreatedSessions(unioned, leftover), created: leftover };
}

/** ACP row wins on the same `id`+`agentId`. Disk rows with no ACP match stay. */
export function unionSessionsById(disk: SessionSummary[], acp: SessionSummary[]): SessionSummary[] {
  const map = new Map<string, SessionSummary>();
  for (const row of disk) map.set(sessionKey(row), row);
  for (const row of acp) {
    const key = sessionKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    map.set(key, {
      ...row,
      ...(!row.parentSessionId && prev.parentSessionId
        ? { parentSessionId: prev.parentSessionId }
        : {}),
      ...(!row.sessionKind && prev.sessionKind ? { sessionKind: prev.sessionKind } : {}),
      ...(!row.dir && prev.dir ? { dir: prev.dir } : {}),
      ...(!(row.cwd ?? "").trim() && prev.cwd ? { cwd: prev.cwd } : {}),
      ...(!row.toolUseId && prev.toolUseId ? { toolUseId: prev.toolUseId } : {}),
      ...(isUntitledSessionTitle(row.id, row.title) && !isUntitledSessionTitle(prev.id, prev.title)
        ? { title: prev.title }
        : {}),
    });
  }
  return [...map.values()];
}

export function omitListedSession(
  listed: Partial<Record<AgentId, SessionSummary[]>>,
  sessionId: string,
): Partial<Record<AgentId, SessionSummary[]>> {
  const next: Partial<Record<AgentId, SessionSummary[]>> = { ...listed };
  for (const key of Object.keys(next) as AgentId[]) {
    const rows = next[key];
    if (!rows) continue;
    next[key] = rows.filter((row) => row.id !== sessionId && row.parentSessionId !== sessionId);
  }
  return next;
}

export function dropDiskSession(disk: SessionSummary[], sessionId: string): SessionSummary[] {
  return disk.filter((row) => row.id !== sessionId && row.parentSessionId !== sessionId);
}

export function isMissingSessionError(e: unknown): boolean {
  const text =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  return /session not found/i.test(text);
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
