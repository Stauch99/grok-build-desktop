import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { basename } from "../lib/text";
import { previewErrorCopy, previewKind, relativeTo } from "../lib/preview";
import { IconGrokClose } from "../grok-icons";
import { IconCode, IconCopy, IconEdit, IconFinder, IconMarkdown, IconSave } from "../icons";
import { Markdown } from "./Markdown";
import { HtmlArtifactPreview } from "./HtmlArtifactPreview";

export type PreviewPaneProps = {
  path: string | null;
  text: string | null;
  truncated?: boolean;
  error?: string | null;
  /** Root used to shorten the path in the header. */
  cwd?: string;
  dark: boolean;
  width?: number;
  embedded?: boolean;
  onClose?: () => void;
  onReveal?: (path: string) => void;
  /** A local path clicked inside a rendered markdown preview. */
  onFollowLink?: (e: ReactMouseEvent) => void;
  onSave?: (path: string, text: string) => void;
};

/**
 * Right-hand file preview. Markdown renders by default — that is the common
 * case for agent output (READMEs, plans, notes) and reading raw markdown
 * source defeats the point of previewing it. Source stays one click away.
 */
export function PreviewPane({
  path,
  text,
  truncated,
  error,
  cwd,
  dark,
  width,
  embedded = false,
  onClose,
  onReveal,
  onFollowLink,
  onSave,
}: PreviewPaneProps) {
  const [raw, setRaw] = useState(false);
  const [draft, setDraft] = useState(text ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setRaw(false);
    setEditing(false);
    setDraft(text ?? "");
  }, [path, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!path) return null;

  const kind = previewKind(path);
  const media = kind === "image" || kind === "video";
  const label = cwd ? relativeTo(path, cwd) : basename(path);
  const loading = !media && text === null && !error;

  return (
    <aside
      className={`preview-pane${embedded ? " embedded" : ""}`}
      style={width ? { width, flexBasis: width } : undefined}
      aria-label={`预览 ${basename(path)}`}
    >
      <header>
        <span className="preview-name" title={path}>
          {label}
        </span>
        <span className="preview-actions">
          {kind === "markdown" && text !== null && !media ? (
            <button
              type="button"
              className="file-open"
              aria-pressed={raw}
              title={raw ? "渲染" : "源码"}
              aria-label={raw ? "渲染" : "源码"}
              onClick={() => setRaw((v) => !v)}
            >
              {raw ? <IconMarkdown size={14} /> : <IconCode size={14} />}
            </button>
          ) : null}
          {text !== null && !media ? (
            <button
              type="button"
              className="file-open"
              title="复制全文"
              aria-label="复制全文"
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              <IconCopy size={14} />
            </button>
          ) : null}
          {text !== null && onSave && !media ? (
            <button
              type="button"
              className="file-open"
              aria-pressed={editing}
              title={editing ? "保存" : "编辑"}
              aria-label={editing ? "保存" : "编辑"}
              onClick={() => {
                if (editing) onSave(path, draft);
                setEditing((v) => !v);
              }}
            >
              {editing ? <IconSave size={14} /> : <IconEdit size={14} />}
            </button>
          ) : null}
          {onReveal ? (
            <button
              type="button"
              className="file-open"
              title="在访达中打开"
              aria-label="在访达中打开"
              onClick={() => onReveal(path)}
            >
              <IconFinder size={14} />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="icon-btn" aria-label="关闭预览" title="关闭预览" onClick={onClose}>
              <IconGrokClose size={16} />
            </button>
          ) : null}
        </span>
      </header>

      {truncated && !media ? <p className="preview-note">文件较大，仅显示前 256KB</p> : null}

      {media ? (
        <div className="preview-body preview-media">
          {kind === "video" ? (
            <video src={convertFileSrc(path)} controls preload="metadata" playsInline />
          ) : (
            <img src={convertFileSrc(path)} alt={basename(path)} />
          )}
        </div>
      ) : loading ? (
        <div className="preview-loading">
          <div className="spinner" />
        </div>
      ) : text === null ? (
        <p className="preview-empty">{error ? previewErrorCopy(error) : "无法预览，请用访达打开"}</p>
      ) : editing ? (
        <textarea
          className="preview-body preview-code"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="编辑文件"
        />
      ) : kind === "html" && !raw ? (
        <div className="preview-body html-frame">
          <HtmlArtifactPreview html={text} title={`沙盒预览 ${basename(path)}`} />
        </div>
      ) : kind === "markdown" && !raw ? (
        <div className="preview-body md-scroll">
          <Markdown text={text} dark={dark} cwd={cwd} onClick={onFollowLink} />
        </div>
      ) : (
        <pre className="preview-body preview-code">{text}</pre>
      )}
    </aside>
  );
}
