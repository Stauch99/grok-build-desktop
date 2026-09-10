import { isAgentId, type AgentId } from "./agent-id";

export type MemoryStatus = "ok" | "failed" | "running" | "blocked-login";
export type FoundingStatus = "idle" | "running" | "ok" | "failed";

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
  tagline: string | null;
  taglineAt: number | null;
  pendingSinceDeep: { sessions: number; mcpBatches: number } | null;
  dailySeenDay: string | null;
  foundingAt: number | null;
  foundingStatus: FoundingStatus | null;
  foundingError: string | null;
  foundingDomainsDone: string[];
  foundingCursors: Record<string, number>;
  foundingModelId: string | null;
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
    tagline: null,
    taglineAt: null,
    pendingSinceDeep: null,
    dailySeenDay: null,
    foundingAt: null,
    foundingStatus: null,
    foundingError: null,
    foundingDomainsDone: [],
    foundingCursors: {},
    foundingModelId: null,
  };
}

function parsePendingSinceDeep(raw: unknown): { sessions: number; mcpBatches: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sessions = typeof row.sessions === "number" ? row.sessions : 0;
  const mcpBatches = typeof row.mcpBatches === "number" ? row.mcpBatches : 0;
  return { sessions, mcpBatches };
}

const TAGLINE_MAX_CHARS = 80;

export function parseMemoryState(raw: unknown): MemoryState {
  const base = emptyMemoryState();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const status = row.lastStatus;
  const agent = row.lastDreamAgentId;
  const tagline = typeof row.tagline === "string" ? row.tagline.trim().slice(0, TAGLINE_MAX_CHARS) : "";
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
    tagline: tagline || null,
    taglineAt: typeof row.taglineAt === "number" ? row.taglineAt : null,
    pendingSinceDeep: parsePendingSinceDeep(row.pendingSinceDeep),
    dailySeenDay: typeof row.dailySeenDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dailySeenDay)
      ? row.dailySeenDay
      : null,
    foundingAt: typeof row.foundingAt === "number" ? row.foundingAt : null,
    foundingStatus:
      row.foundingStatus === "idle" ||
      row.foundingStatus === "running" ||
      row.foundingStatus === "ok" ||
      row.foundingStatus === "failed"
        ? row.foundingStatus
        : null,
    foundingError: typeof row.foundingError === "string" ? row.foundingError : null,
    foundingDomainsDone: Array.isArray(row.foundingDomainsDone)
      ? row.foundingDomainsDone.filter((x) => typeof x === "string")
      : [],
    foundingCursors:
      row.foundingCursors && typeof row.foundingCursors === "object"
        ? (row.foundingCursors as Record<string, number>)
        : {},
    foundingModelId: typeof row.foundingModelId === "string" ? row.foundingModelId : null,
  };
}
