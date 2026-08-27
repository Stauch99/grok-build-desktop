import type { ChatItem } from "./chat";

export type TrajectoryRow = { id: string; kind: ChatItem["kind"]; label: string };

function labelOf(item: ChatItem): string {
  if (item.kind === "user" || item.kind === "assistant" || item.kind === "thought") return item.text;
  if (item.kind === "tool") return item.title;
  if (item.kind === "plan") return "计划";
  if (item.kind === "compact") return item.phase === "completed" ? "压缩完成" : "开始压缩";
  return "";
}

export function trajectoryRows(items: ChatItem[]): TrajectoryRow[] {
  return items.map((item) => ({ id: item.id, kind: item.kind, label: labelOf(item) }));
}
