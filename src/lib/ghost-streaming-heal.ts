import type { ChatItem, ChatState } from "./chat";
import { stallLevel } from "./stall";

/** Wait this long after optimistic send if session/prompt never left the client. */
export const GHOST_STREAMING_GRACE_MS = 45_000;

/** Poll while a pre-token echoed user is showing. */
export const GHOST_STREAMING_POLL_MS = 5_000;

/** Bound `session/prompt` waiters so a wedged CLI cannot leak forever. Do not auto-resend. */
export const PROMPT_RPC_TIMEOUT_MS = 10 * 60_000;

export type GhostTurn = {
  dropIds: string[];
  restoreComposerText: string;
};

export type GhostStreamingEvidence = {
  busy: boolean;
  pendingPermission: boolean;
  /** True until session/prompt is written. Thinking after write is not a ghost. */
  sendInFlight: boolean;
  turnStartedAt: number | null;
  nowMs: number;
  items: ChatItem[];
  graceMs?: number;
};

/** Trailing echoed user with no assistant/tool/thought after it. */
export function findOptimisticGhostTurn(items: ChatItem[]): GhostTurn | null {
  const last = items[items.length - 1];
  if (!last || last.kind !== "user") return null;
  return { dropIds: [last.id], restoreComposerText: last.text };
}

export function shouldHealGhostStreaming(e: GhostStreamingEvidence): boolean {
  if (!e.busy || !e.sendInFlight || e.pendingPermission) return false;
  if (e.turnStartedAt == null) return false;
  const grace = e.graceMs ?? GHOST_STREAMING_GRACE_MS;
  if (e.nowMs - e.turnStartedAt < grace) return false;
  return findOptimisticGhostTurn(e.items) != null;
}

export type WedgedRetryEvidence = {
  busy: boolean;
  pendingPermission: boolean;
  /** False once session/prompt has left the client. Ghost heal covers the in-flight case. */
  sendInFlight: boolean;
  lastActivityAt: number;
  nowMs: number;
};

/** Prompt already written, turn quiet long enough to be stuck — offer stop-and-retry, never auto-resend. */
export function shouldOfferWedgedRetry(e: WedgedRetryEvidence): boolean {
  if (!e.busy || e.sendInFlight || e.pendingPermission) return false;
  return stallLevel(e.nowMs - e.lastActivityAt) === "stuck";
}

export function applyGhostHeal(chat: ChatState, turn: GhostTurn): ChatState {
  const drop = new Set(turn.dropIds);
  return { ...chat, items: chat.items.filter((item) => !drop.has(item.id)) };
}

/** Main-turn clock only. Extra-pane busy must not keep a stale start time. */
export function stampMainTurnClock(
  busy: boolean,
  previous: number | null,
  nowMs: number,
): number | null {
  if (!busy) return null;
  return previous ?? nowMs;
}
