import type { ChatItem } from "../lib/chat";
import { useT } from "../lib/locale-context";

export type DetailsTool = Extract<ChatItem, { kind: "tool" }>;
export type DetailsPanelProps = { tool: DetailsTool | null; onOpenPath?: (path: string) => void };

export function DetailsPanel({ tool, onOpenPath }: DetailsPanelProps) {
  const t = useT();
  if (!tool) return <p className="float-empty">{t("details.empty")}</p>;
  return (
    <div className="details-body">
      <p className="hub-meta">{tool.toolKind || t("details.tool")} · {tool.status}</p>
      <h3>{tool.title}</h3>
      {tool.diff?.path ? (
        <button type="button" className="file-item" onClick={() => onOpenPath?.(tool.diff!.path)}>
          {tool.diff.path}
        </button>
      ) : null}
      {tool.detail ? (
        <pre className="hub-preview">{tool.detail.slice(0, 12000)}</pre>
      ) : (
        <p className="float-empty">{t("details.none")}</p>
      )}
    </div>
  );
}
