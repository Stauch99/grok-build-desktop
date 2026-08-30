import { isAgentId, type AgentId } from "./agent-id";

export type MemoryStatus = "ok" | "failed" | "running" | "blocked-login";

export type MemoryState = {
  lastDeepAt: number | null;
  lastScanAt: number | null;
  lockOwner: string | null;
  cursors: Record<string, number>;
  forgotten: string[];
  userMdPreimage: string | null;
  lastStatus: MemoryStatus | null;
  lastError: string | null;
  lastDreamAgentId: AgentId | null;
};

export function emptyMemoryState(): MemoryState {
  return {
    lastDeepAt: null,
    lastScanAt: null,
    lockOwner: null,
    cursors: {},
    forgotten: [],
    userMdPreimage: null,
    lastStatus: null,
    lastError: null,
    lastDreamAgentId: null,
  };
}

export function parseMemoryState(raw: unknown): MemoryState {
  const base = emptyMemoryState();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const status = row.lastStatus;
  const agent = row.lastDreamAgentId;
  return {
    lastDeepAt: typeof row.lastDeepAt === "number" ? row.lastDeepAt : null,
    lastScanAt: typeof row.lastScanAt === "number" ? row.lastScanAt : null,
    lockOwner: typeof row.lockOwner === "string" ? row.lockOwner : null,
    cursors: row.cursors && typeof row.cursors === "object" ? (row.cursors as Record<string, number>) : {},
    forgotten: Array.isArray(row.forgotten) ? row.forgotten.filter((x) => typeof x === "string") : [],
    userMdPreimage: typeof row.userMdPreimage === "string" ? row.userMdPreimage : null,
    lastStatus: status === "ok" || status === "failed" || status === "running" || status === "blocked-login" ? status : null,
    lastError: typeof row.lastError === "string" ? row.lastError : null,
    lastDreamAgentId: typeof agent === "string" && isAgentId(agent) ? agent : null,
  };
}
