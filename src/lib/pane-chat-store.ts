import type { ChatState } from "./chat";
import { emptyChat } from "./chat";

export type PaneChatSnap = {
  chat: ChatState;
  busy: boolean;
};

export type ExtraPaneShell = {
  sessionId: string;
  cwd: string;
  draft: string;
  busy: boolean;
  atBottom: boolean;
  queue: unknown;
  agentId: string;
  chat: ChatState;
};

const EMPTY_CHAT: ChatState = emptyChat();
const EMPTY_SNAP: PaneChatSnap = { chat: EMPTY_CHAT, busy: false };

/** Coarse identity so App can skip token-level chat reconciles. */
export function chatShellKey(chat: ChatState): string {
  const last = chat.items[chat.items.length - 1];
  const lastId = last?.id ?? "";
  const lastKind = last?.kind ?? "";
  let tools = "";
  for (const item of chat.items) {
    if (item.kind === "tool") tools += `${item.id}:${item.status},`;
  }
  let plan = "";
  for (const entry of chat.plan) {
    plan += `${entry.content}:${entry.status ?? ""},`;
  }
  return `${chat.items.length}|${lastId}|${lastKind}|${tools}|${chat.commands.length}|${plan}|${Number(!!chat.truncated)}`;
}

export function extraPaneShouldRender(prev: ExtraPaneShell, next: ExtraPaneShell): boolean {
  return (
    prev.sessionId !== next.sessionId ||
    prev.cwd !== next.cwd ||
    prev.draft !== next.draft ||
    prev.busy !== next.busy ||
    prev.atBottom !== next.atBottom ||
    prev.queue !== next.queue ||
    prev.agentId !== next.agentId ||
    chatShellKey(prev.chat) !== chatShellKey(next.chat)
  );
}

export type PaneChatStore = {
  subscribe: (listener: () => void) => () => void;
  getMain: () => PaneChatSnap;
  getExtra: (paneId: string) => PaneChatSnap;
  setMainChat: (chat: ChatState) => void;
  setMainBusy: (busy: boolean) => void;
  replaceExtra: (paneId: string, snap: PaneChatSnap) => void;
  dropExtra: (paneId: string) => void;
};

export function createPaneChatStore(): PaneChatStore {
  let main: PaneChatSnap = { chat: emptyChat(), busy: false };
  const extra = new Map<string, PaneChatSnap>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getMain() {
      return main;
    },
    getExtra(paneId) {
      return extra.get(paneId) ?? EMPTY_SNAP;
    },
    setMainChat(chat) {
      if (main.chat === chat) return;
      main = { ...main, chat };
      emit();
    },
    setMainBusy(busy) {
      if (main.busy === busy) return;
      main = { ...main, busy };
      emit();
    },
    replaceExtra(paneId, snap) {
      const prev = extra.get(paneId);
      if (prev && prev.chat === snap.chat && prev.busy === snap.busy) return;
      extra.set(paneId, snap);
      emit();
    },
    dropExtra(paneId) {
      if (!extra.has(paneId)) return;
      extra.delete(paneId);
      emit();
    },
  };
}
