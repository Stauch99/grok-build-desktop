import { convertFileSrc } from "@tauri-apps/api/core";
import { useState, type MouseEventHandler } from "react";
import { IconGrokCopy, IconGrokEdit, IconGrokRegenerate } from "../grok-icons";
import { IconGitFork, IconUndo } from "../icons";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { rewriteLocalMediaHtml } from "../lib/media";
import { escapeText, linkifyLocalPaths } from "../lib/text";

export type UserTurnProps = {
  text: string;
  cwd: string;
  onCopy: () => void;
  onResend: () => void;
  onEditResend?: (next: string) => void;
  /**
   * Revert every file edit made after this turn. Absent when there is nothing
   * to undo, so the control never appears as a no-op.
   */
  onRewind?: () => void;
  onFork?: () => void;
  /** Forwarded to the .md bubble so callers can keep onMdClick(e, cwd). */
  onClick?: MouseEventHandler<HTMLDivElement>;
  model?: string;
  /** Already formatted wall clock, e.g. `14:32`. */
  clock?: string;
  sessionModel?: string | null;
};

export function UserTurn({
  text,
  cwd,
  onCopy,
  onResend,
  onEditResend,
  onRewind,
  onFork,
  onClick,
  model,
  clock,
  sessionModel,
}: UserTurnProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const showModelChip = !!(model && sessionModel && model !== sessionModel);
  const showMeta = !!(clock || showModelChip);

  if (editing) {
    return (
      <article className="msg user" data-cwd={cwd || undefined}>
        <textarea
          className="user-turn-edit"
          value={draft}
          rows={Math.min(12, Math.max(3, draft.split("\n").length + 1))}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div className="msg-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const next = draft;
              setEditing(false);
              onEditResend?.(next);
            }}
          >
            发送
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(text);
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="msg user" data-cwd={cwd || undefined}>
      <div
        className="md"
        onClick={onClick}
        dangerouslySetInnerHTML={{
          __html: rewriteLocalMediaHtml(
            linkifyLocalPaths(escapeText(text).replace(/\n/g, "<br/>")),
            cwd,
            (path) => safeFileSrc(path, assetRoots(cwd, ""), convertFileSrc) ?? "",
          ),
        }}
      />
      {showMeta ? (
        <div className="turn-meta">
          {clock ? <span>{clock}</span> : null}
          {showModelChip ? <span className="model-chip differs">{model}</span> : null}
        </div>
      ) : null}
      <div className="msg-actions">
        <button type="button" onClick={onCopy} aria-label="复制" title="复制">
          <IconGrokCopy />
        </button>
        <button type="button" onClick={onResend} aria-label="重发" title="重发">
          <IconGrokRegenerate />
        </button>
        {onEditResend ? (
          <button
            type="button"
            aria-label="编辑后重发"
            title="编辑后重发"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            <IconGrokEdit />
          </button>
        ) : null}
        {onRewind ? (
          <button
            type="button"
            title="把这一轮之后的文件改动还原"
            aria-label="回到这里"
            onClick={onRewind}
          >
            <IconUndo size={14} />
          </button>
        ) : null}
        {onFork ? (
          <button type="button" title="从此处分叉" aria-label="从此处分叉" onClick={onFork}>
            <IconGitFork size={16} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
