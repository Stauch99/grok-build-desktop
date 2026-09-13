import { useCallback, useSyncExternalStore } from "react";
import { MAIN_PANE } from "../lib/pane-tree";
import type { PaneChatSnap, PaneChatStore } from "../lib/pane-chat-store";

export function usePaneChat(store: PaneChatStore, paneId: string): PaneChatSnap {
  const getSnapshot = useCallback(
    () => (paneId === MAIN_PANE ? store.getMain() : store.getExtra(paneId)),
    [store, paneId],
  );
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
