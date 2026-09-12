import type { ChatState } from "./chat";
import { t } from "./i18n";

export type TurnLease = {
  sessionId: string;
  status: "active" | "interrupted";
  startedAt: number;
  updatedAt: number;
};

export function turnLeaseAfterCrash(lease: TurnLease | null, at: number): TurnLease | null {
  if (!lease) return null;
  if (lease.status !== "active") return lease;
  return { ...lease, status: "interrupted", updatedAt: at };
}

export function turnIsLive(chat: ChatState, busy: boolean): boolean {
  if (busy) return true;
  return chat.items.some(
    (item) => item.kind === "tool" && (item.status === "pending" || item.status === "in_progress"),
  );
}

/** Fail open tools and append a notice so a crashed Host cannot look idle-complete. */
export function applyTurnCrash(
  chat: ChatState,
  opts: { busy: boolean; detail: string; at: number },
): ChatState {
  if (!turnIsLive(chat, opts.busy)) return chat;
  const items = chat.items.map((item) => {
    if (item.kind === "tool" && (item.status === "pending" || item.status === "in_progress")) {
      return { ...item, status: "cancelled" as const };
    }
    return item;
  });
  return withCrashNotice({ ...chat, items }, opts.detail, opts.at);
}

function withCrashNotice(chat: ChatState, detail: string, at: number): ChatState {
  const last = chat.items[chat.items.length - 1];
  if (last?.kind === "tool" && last.status === "failed" && last.detail === detail) return chat;
  return {
    ...chat,
    items: [
      ...chat.items,
      {
        kind: "tool",
        id: `fail-${chat.nextId}`,
        title: t("zh", "acp.requestFailed"),
        status: "failed",
        detail,
        at,
      },
    ],
    nextId: chat.nextId + 1,
  };
}
