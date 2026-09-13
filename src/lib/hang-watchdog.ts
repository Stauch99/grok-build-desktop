import { itemsAfterLastUser } from "./chat";
import type { ChatItem } from "./chat";

/** Quiet time after which a busy turn with nothing in flight offers manual recovery. */
export const HANG_WATCHDOG_MS = 90_000;

/** A turn still driving tools may legitimately run long; only stall copy applies. */
export type HangVerdict = {
  shouldOffer: boolean;
  quietMs: number;
  /** Original prompt text of the stuck turn, for resend / draft restore. */
  text: string | null;
};

export function evaluateHangWatchdog(opts: {
  busy: boolean;
  nowMs: number;
  lastActivityMs: number;
  items: ChatItem[];
  permissionPending: boolean;
}): HangVerdict {
  const quietMs = opts.nowMs - opts.lastActivityMs;
  const idle: HangVerdict = { shouldOffer: false, quietMs, text: null };
  if (!opts.busy || opts.permissionPending) return idle;
  if (quietMs < HANG_WATCHDOG_MS) return idle;
  const turn = itemsAfterLastUser(opts.items);
  if (turn.some((it) => it.kind === "tool" && (it.status === "pending" || it.status === "in_progress"))) {
    return idle;
  }
  for (let i = opts.items.length - 1; i >= 0; i--) {
    const item = opts.items[i];
    if (item.kind === "user") {
      return { shouldOffer: !!item.text.trim(), quietMs, text: item.text };
    }
  }
  return idle;
}
