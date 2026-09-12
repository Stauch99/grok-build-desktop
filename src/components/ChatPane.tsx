import { useMemo, type ReactNode, type RefObject } from "react";
import type { ChatItem, ChatState } from "../lib/chat";
import { usePaneChat } from "../hooks/usePaneChat";
import type { PaneChatStore } from "../lib/pane-chat-store";
import { IconChevron } from "../icons";
import { useT } from "../lib/locale-context";
import { ThreadColumn } from "./Thread";

export type ChatPaneProps = {
  store: PaneChatStore;
  paneId: string;
  chatWidth: number;
  dark: boolean;
  cwd: string;
  showThinking: boolean;
  emptyTitle: string;
  emptyNode?: ReactNode;
  onCancel: () => void;
  chatRef: RefObject<HTMLDivElement | null>;
  onScroll: (el: HTMLDivElement) => void;
  sessionModel?: string | null;
  onResendUser?: (text: string) => void;
  rewindFor?: (itemId: string) => (() => void) | undefined;
  onForkTurn?: (itemId: string) => void;
  onInspectTool?: (item: Extract<ChatItem, { kind: "tool" }>) => void;
  onPreviewPath?: (path: string) => void;
  highlightQuery?: string;
  jumpId?: string | null;
  pinToLatest?: boolean;
  sessionId?: string | null;
  loading?: boolean;
  onDraftUser?: (text: string) => void;
  stallNote?: string;
  atBottom: boolean;
  onJumpBottom: () => void;
};

function urlChipsFrom(chat: ChatState): string[] {
  const last = [...chat.items].reverse().find((item) => item.kind === "assistant");
  if (!last || last.kind !== "assistant") return [];
  return Array.from(last.text.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]).slice(0, 3);
}

/** Subscribes to pane chat/busy so streaming tokens do not reconcile App. */
export function ChatPane({
  store,
  paneId,
  loading = false,
  atBottom,
  onJumpBottom,
  emptyTitle,
  emptyNode,
  ...thread
}: ChatPaneProps) {
  const t = useT();
  const { chat, busy } = usePaneChat(store, paneId);
  const turns = useMemo(
    () => chat.items.filter((item): item is Extract<ChatItem, { kind: "user" }> => item.kind === "user"),
    [chat.items],
  );
  const urlChips = useMemo(() => urlChipsFrom(chat), [chat.items]);
  const empty = chat.items.length === 0 && !loading;

  return (
    <>
      <ThreadColumn
        {...thread}
        paneId={paneId}
        chat={chat}
        busy={busy}
        turns={turns}
        urlChips={urlChips}
        empty={empty}
        emptyTitle={emptyTitle}
        emptyNode={emptyNode}
        loading={loading}
      />
      {!atBottom && chat.items.length > 0 ? (
        <button type="button" className="jump-bottom" aria-label={t("thread.scrollBottom")} onClick={onJumpBottom}>
          <IconChevron size={16} />
        </button>
      ) : null}
    </>
  );
}
