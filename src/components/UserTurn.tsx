import { convertFileSrc } from "@tauri-apps/api/core";
import { useState, type MouseEventHandler } from "react";
import { IconGrokCopy, IconGrokEdit, IconGrokRegenerate } from "../grok-icons";
import { IconChevron, IconGitFork, IconUndo } from "../icons";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { splitInjectedMemory } from "../lib/memory-inject";
import { rewriteLocalMediaHtml } from "../lib/media";
import { escapeText, linkifyLocalPaths } from "../lib/text";
import { useT } from "../lib/locale-context";

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
  const t = useT();
  const { visible, injected } = splitInjectedMemory(text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(visible);
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
            {t("composer.send")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(visible);
              setEditing(false);
            }}
          >
            {t("sidebar.cancel")}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="msg user" data-cwd={cwd || undefined}>
      {injected ? (
        <details className="user-memory-fold">
          <summary>
            <span className="fold-chev" aria-hidden>
              <IconChevron size={12} />
            </span>
            {t("memory.loadedChip")}
          </summary>
          <div className="user-memory-fold-body">{injected}</div>
        </details>
      ) : null}
      {visible ? (
        <div
          className="md"
          onClick={onClick}
          dangerouslySetInnerHTML={{
            __html: rewriteLocalMediaHtml(
              linkifyLocalPaths(escapeText(visible).replace(/\n/g, "<br/>")),
              cwd,
              (path) => safeFileSrc(path, assetRoots(cwd, ""), convertFileSrc) ?? "",
            ),
          }}
        />
      ) : null}
      {showMeta ? (
        <div className="turn-meta">
          {clock ? <span>{clock}</span> : null}
          {showModelChip ? <span className="model-chip differs">{model}</span> : null}
        </div>
      ) : null}
      <div className="msg-actions">
        <button type="button" onClick={onCopy} aria-label={t("thread.copy")}>
          <IconGrokCopy />
        </button>
        <button type="button" onClick={onResend} aria-label={t("thread.resend")}>
          <IconGrokRegenerate />
        </button>
        {onEditResend ? (
          <button
            type="button"
            aria-label={t("thread.editResend")}
            onClick={() => {
              setDraft(visible);
              setEditing(true);
            }}
          >
            <IconGrokEdit />
          </button>
        ) : null}
        {onRewind ? (
          <button
            type="button"
            aria-label={t("thread.rewindHere")}
            onClick={onRewind}
          >
            <IconUndo size={14} />
          </button>
        ) : null}
        {onFork ? (
          <button type="button" aria-label={t("thread.forkHere")} onClick={onFork}>
            <IconGitFork size={16} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
