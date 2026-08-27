export type NotifyReason = "turn-done" | "permission";

export type NotifyInput = {
  reason: NotifyReason;
  /** Whether the app window currently has focus. */
  focused: boolean;
  /** How long the turn ran. Ignored for permission prompts. */
  elapsedMs?: number;
};

/** Turns shorter than this are not worth a notification — you were watching. */
export const SHORT_TURN_MS = 15_000;

/**
 * Never interrupt someone who is already looking at the window. A permission
 * prompt blocks the agent, so it notifies regardless of how long it took;
 * a completed turn only notifies if it ran long enough that you likely left.
 */
export function shouldNotify({ reason, focused, elapsedMs = 0 }: NotifyInput): boolean {
  if (focused) return false;
  if (reason === "permission") return true;
  return elapsedMs >= SHORT_TURN_MS;
}

export function notifyText(
  reason: NotifyReason,
  sessionTitle: string,
  detail = "",
): { title: string; body: string } {
  const name = sessionTitle.trim() || "会话";
  if (reason === "permission") {
    return { title: "需要许可", body: detail ? `${name} · ${detail}` : name };
  }
  return { title: "任务完成", body: detail ? `${name} · ${detail}` : name };
}

/** Dock badge: pending permissions first, then turns that finished while away. */
export function badgeCount(pendingPermissions: number, unseenDone: number): number {
  return Math.max(0, pendingPermissions) + Math.max(0, unseenDone);
}

/** Menu-bar title. Empty string clears it. */
export function trayStatus(busy: boolean, pendingPermissions: number): string {
  if (pendingPermissions > 0) return `● 待许可 ${pendingPermissions}`;
  return busy ? "● 运行中" : "";
}
