import type { ChatItem, ThreadBlock } from "./chat";
import { splitInjectedMemory } from "./memory-inject";

/** One hit per message row that contains the query (user + assistant text only). */
export type ThreadFindHit = {
  id: string;
  /** Index into the ThreadBlock[] rows, for virtualized scrollToRow. */
  blockIndex: number;
};

/** Text the in-thread find searches for an item; "" when the kind is not searchable. */
export function findableText(item: ChatItem): string {
  if (item.kind === "user") return splitInjectedMemory(item.text).visible;
  if (item.kind === "assistant") return item.text;
  return "";
}

/** Case-insensitive substring hits in conversation order. Empty query → no hits. */
export function findThreadHits(blocks: ThreadBlock[], query: string): ThreadFindHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: ThreadFindHit[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind !== "item") continue;
    const text = findableText(block.item);
    if (text && text.toLowerCase().includes(needle)) {
      hits.push({ id: block.item.id, blockIndex: i });
    }
  }
  return hits;
}

/** Wrap-around step through hits; -1 when there is nothing to step through. */
export function stepFindIndex(current: number, dir: 1 | -1, total: number): number {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) return dir === 1 ? 0 : total - 1;
  return (current + dir + total) % total;
}
