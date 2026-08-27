import type { ChatItem } from "../lib/chat";

export type DetailsTool = Extract<ChatItem, { kind: "tool" }>;
export type DetailsPanelProps = { tool: DetailsTool | null; onOpenPath?: (path: string) => void };

export function DetailsPanel({ tool, onOpenPath }: DetailsPanelProps) {
  if (!tool) return <p className="float-empty">点一次工具调用查看参数和结果。</p>;
  return <div className="details-body">
    <p className="hub-meta">{tool.toolKind || "工具"} · {tool.status}</p>
    <h3>{tool.title}</h3>
    {tool.diff?.path ? <button type="button" className="file-item" onClick={() => onOpenPath?.(tool.diff!.path)}>{tool.diff.path}</button> : null}
    {tool.detail ? <pre className="hub-preview">{tool.detail.slice(0, 12000)}</pre> : <p className="float-empty">无详细输出</p>}
  </div>;
}
