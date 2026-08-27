import type { ChatItem } from "./chat";

export function forkAtSlash(_userItemId?: string): string {
  return "/fork";
}

export function turnFilesAfter(items: ChatItem[], userId: string): string[] {
  const start = items.findIndex((it) => it.kind === "user" && it.id === userId);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "user") break;
    if (it.kind === "tool" && it.diff?.path) out.push(it.diff.path);
  }
  return out;
}

export function lastTurnFiles(items: ChatItem[]): string[] {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "user") return turnFilesAfter(items, items[i].id);
  }
  return [];
}
