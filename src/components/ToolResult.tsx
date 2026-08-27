import { classifyTool, previewLines } from "../lib/tool-render";
import { DiffView } from "./DiffView";

export type ToolResultDiff = {
  path: string;
  oldText?: string | null;
  newText?: string;
};

export type ToolResultProps = {
  title: string;
  toolKind?: string;
  status: string;
  detail?: string;
  diff?: ToolResultDiff;
  onOpenPath?: (path: string) => void;
};

const KIND_LABEL: Record<string, string> = {
  bash: "终端",
  read: "读取",
  edit: "编辑",
  search: "搜索",
  write: "写入",
  other: "工具",
};

/**
 * Fold body content for a tool call (no Fold wrapper — parent owns collapse).
 * The class from `classifyTool` drives a color rail so a run of tool cards is
 * scannable by shape instead of by reading every title.
 */
export function ToolResult({
  title,
  toolKind,
  status,
  detail,
  diff,
  onOpenPath,
}: ToolResultProps) {
  const kind = classifyTool(title, toolKind);
  const preview = previewLines(detail);

  return (
    <div className="tool-result" data-tool-class={kind} data-status={status}>
      <div className="tool-result-title">
        <span className="tool-kind">{KIND_LABEL[kind] ?? kind}</span>
        <span className="tool-title">{title || toolKind || "工具调用"}</span>
        {status ? <span className={`fold-meta ${status}`}>{status}</span> : null}
      </div>
      {diff ? (
        <DiffView
          path={diff.path}
          oldText={diff.oldText}
          newText={diff.newText}
          onOpen={onOpenPath}
        />
      ) : preview ? (
        <pre>{preview}</pre>
      ) : (
        <p className="tool-empty">无详细输出</p>
      )}
    </div>
  );
}
