/**
 * In-app notification center: a small ring buffer mirroring the OS
 * notifications the app already sends (turn finished, permission needed),
 * so a ping is still reachable after the toast/banner is gone.
 * Module-level store — subscribers re-render through `subscribeNotifyCenter`.
 */

export type NotifyKind = "needs-you" | "done" | "error";

export type NotifyEntry = {
  id: number;
  kind: NotifyKind;
  title: string;
  body: string;
  sessionId?: string | null;
  at: number;
  read: boolean;
};

export type NotifyInput = {
  kind: NotifyKind;
  title: string;
  body: string;
  sessionId?: string | null;
  at?: number;
};

export const NOTIFY_CENTER_CAP = 20;

let entries: NotifyEntry[] = [];
let seq = 0;
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
}

/** Unread = entries pushed since the last open/mark-read. */
export function notifyUnread(list: readonly NotifyEntry[] = entries): number {
  return list.reduce((n, e) => n + (e.read ? 0 : 1), 0);
}

/** Newest first. Oldest entries drop off once the cap is hit. */
export function pushNotifyEntry(input: NotifyInput): NotifyEntry {
  const entry: NotifyEntry = {
    id: ++seq,
    kind: input.kind,
    title: input.title,
    body: input.body,
    sessionId: input.sessionId ?? null,
    at: input.at ?? Date.now(),
    read: false,
  };
  entries = [entry, ...entries].slice(0, NOTIFY_CENTER_CAP);
  emit();
  return entry;
}

let cachedSnapshot: { entries: NotifyEntry[]; unread: number } | null = null;

/** Stable snapshot for useSyncExternalStore — same object until the buffer changes. */
export function notifyCenterSnapshot(): { entries: NotifyEntry[]; unread: number } {
  if (!cachedSnapshot || cachedSnapshot.entries !== entries) {
    cachedSnapshot = { entries, unread: notifyUnread(entries) };
  }
  return cachedSnapshot;
}

export function subscribeNotifyCenter(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function markNotifyRead(id: number): void {
  if (!entries.some((e) => e.id === id && !e.read)) return;
  entries = entries.map((e) => (e.id === id ? { ...e, read: true } : e));
  emit();
}

export function markAllNotifyRead(): void {
  if (!entries.some((e) => !e.read)) return;
  entries = entries.map((e) => (e.read ? e : { ...e, read: true }));
  emit();
}

export function clearNotifyCenter(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

/** Tests only — the app keeps history for the window's lifetime. */
export function resetNotifyCenter(): void {
  entries = [];
  seq = 0;
  emit();
}
