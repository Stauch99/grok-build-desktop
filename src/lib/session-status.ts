/**
 * Per-session status for the sidebar.
 *
 * The research consensus is that the durable unread badge — not the OS
 * notification — is the reliable signal that a background turn finished:
 * notification delivery is measurably lossy, a badge on the row is not.
 * So `unread` is persisted and only cleared when you actually open the session.
 */
export type SessionStatus = "working" | "needs-you" | "done" | "error" | "idle";

/** Persisted in `~/.grok/webui.json`. Only terminal states are stored. */
export type UnreadMap = Record<string, "done" | "error">;

export type DeriveInput = {
  id: string;
  /** Sessions this app is actively driving right now. */
  busyIds: string[];
  /** Session the pending permission prompt belongs to, if any. */
  awaitingId: string | null;
  unread: UnreadMap;
};

export function deriveStatus({ id, busyIds, awaitingId, unread }: DeriveInput): SessionStatus {
  if (awaitingId === id) return "needs-you";
  if (busyIds.includes(id)) return "working";
  const mark = unread[id];
  if (mark === "error") return "error";
  if (mark === "done") return "done";
  return "idle";
}

const LABELS: Record<SessionStatus, string> = {
  working: "运行中",
  "needs-you": "等你确认",
  done: "已完成，未查看",
  error: "出错，未查看",
  idle: "",
};

export function statusLabel(status: SessionStatus): string {
  return LABELS[status];
}

/** Sort weight: what costs you most by waiting comes first. */
const ORDER: Record<SessionStatus, number> = {
  "needs-you": 0,
  error: 1,
  done: 2,
  working: 3,
  idle: 4,
};

export function statusOrder(status: SessionStatus): number {
  return ORDER[status];
}

/** A status worth pulling to the top of the sidebar. */
export function isAttention(status: SessionStatus): boolean {
  return status === "needs-you" || status === "error";
}

export function markUnread(unread: UnreadMap, id: string, kind: "done" | "error"): UnreadMap {
  if (!id) return unread;
  if (unread[id] === kind) return unread;
  return { ...unread, [id]: kind };
}

export function clearUnread(unread: UnreadMap, id: string): UnreadMap {
  if (!id || !(id in unread)) return unread;
  const next = { ...unread };
  delete next[id];
  return next;
}

/** Drop entries for sessions that no longer exist so the file cannot grow forever. */
export function pruneUnread(unread: UnreadMap, liveIds: string[]): UnreadMap {
  const live = new Set(liveIds);
  const next: UnreadMap = {};
  for (const [id, kind] of Object.entries(unread)) {
    if (live.has(id)) next[id] = kind;
  }
  return next;
}

export function loadUnread(raw: unknown): UnreadMap {
  if (!raw || typeof raw !== "object") return {};
  const out: UnreadMap = {};
  for (const [id, kind] of Object.entries(raw as Record<string, unknown>)) {
    if (kind === "done" || kind === "error") out[id] = kind;
  }
  return out;
}

/** How many sessions are actively asking for the user. Drives the dock badge. */
export function attentionCount(unread: UnreadMap, awaitingId: string | null): number {
  const errors = Object.values(unread).filter((k) => k === "error").length;
  return errors + (awaitingId ? 1 : 0);
}
