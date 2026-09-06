import { classifyTool, previewLines } from "../lib/tool-render";
import { useT } from "../lib/locale-context";
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
  const t = useT();
  const kind = classifyTool(title, toolKind);
  const preview = previewLines(detail);
  const kindLabel = t(`tool.${kind}`);

  return (
    <div className="tool-result" data-tool-class={kind} data-status={status}>
      <div className="tool-result-title">
        <span className="tool-kind">{kindLabel}</span>
        <span className="tool-title">{title || toolKind || t("tool.call")}</span>
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
        <p className="tool-empty">{t("tool.empty")}</p>
      )}
    </div>
  );
}
