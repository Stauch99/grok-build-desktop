import { useEffect, useRef, useState } from "react";
import { gitCommit, type GitStatus } from "../api";
import { branchMismatchToast, commitMessageOk } from "../lib/git-commit";
import { branchLabel } from "../lib/git";
import { IconGrokPlus } from "../grok-icons";
import { IconBranch } from "../icons";

export type GitBarProps = {
  status: GitStatus | null;
  /** Opens the task/files panel on the changes tab. */
  onOpenChanges: () => void;
  onNewWorktree: () => void;
  busy?: boolean;
  /** Branch the open session's worktree is bound to. */
  sessionBranch?: string | null;
  onCommitted?: () => void;
  onToast?: (msg: string) => void;
};

/**
 * One line of version-control context in the workspace header. Deliberately
 * not a git client: branch, how dirty the tree is, a one-click commit, and
 * a way to start an isolated worktree session.
 */
export function GitBar({
  status,
  onOpenChanges,
  onNewWorktree,
  busy,
  sessionBranch,
  onCommitted,
  onToast,
}: GitBarProps) {
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const toasted = useRef("");

  useEffect(() => {
    const next = status?.branch ?? "";
    const msg = branchMismatchToast(sessionBranch, next);
    const key = `${sessionBranch ?? ""}|${next}`;
    if (msg && toasted.current !== key) {
      toasted.current = key;
      setHint(msg);
      onToast?.(msg);
    } else if (!msg) {
      toasted.current = key;
      setHint((prev) => (prev === "当前会话绑定另一条分支" ? null : prev));
    }
  }, [sessionBranch, status?.branch, onToast]);

  if (!status?.isRepo) return null;
  const label = branchLabel(status);
  const canCommit = commitMessageOk(message) && !busy && !committing;

  const submit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    setHint(null);
    try {
      const res = await gitCommit(status.root, message);
      if (res.ok) {
        setMessage("");
        onCommitted?.();
      } else {
        const err = res.stderr.trim() || "提交失败";
        setHint(err);
        onToast?.(err);
      }
    } catch (e) {
      const err = String(e);
      setHint(err);
      onToast?.(err);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="git-bar">
      <button
        type="button"
        className="git-chip"
        onClick={onOpenChanges}
        title={status.dirty > 0 ? `${status.dirty} 个文件有改动` : "工作区干净"}
      >
        <IconBranch size={13} />
        <span className="git-branch">{label}</span>
        {status.dirty > 0 && <span className="git-dirty">{status.dirty}</span>}
      </button>
      <input
        className="title-input"
        style={{ flex: "0 1 140px", maxWidth: 140 }}
        value={message}
        placeholder="提交说明"
        aria-label="提交说明"
        disabled={busy || committing}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        className="git-chip"
        disabled={!canCommit}
        title="暂存并提交"
        onClick={() => void submit()}
      >
        提交
      </button>
      <button
        type="button"
        className="git-chip ghost"
        onClick={onNewWorktree}
        disabled={busy}
        title="在隔离的 worktree 里新开一个会话"
      >
        <IconGrokPlus size={14} />
        worktree
      </button>
      {hint ? (
        <span className="preview-note" role="status">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
