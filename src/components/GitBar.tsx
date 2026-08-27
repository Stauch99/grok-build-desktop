import type { GitStatus } from "../api";
import { branchLabel } from "../lib/git";
import { IconBranch, IconPlus } from "../icons";

export type GitBarProps = {
  status: GitStatus | null;
  /** Opens the task/files panel on the changes tab. */
  onOpenChanges: () => void;
  onNewWorktree: () => void;
  busy?: boolean;
};

/**
 * One line of version-control context in the workspace header. Deliberately
 * not a git client: branch, how dirty the tree is, and a way to start an
 * isolated worktree session. Everything else stays in a real git tool.
 */
export function GitBar({ status, onOpenChanges, onNewWorktree, busy }: GitBarProps) {
  if (!status?.isRepo) return null;
  const label = branchLabel(status);

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
      <button
        type="button"
        className="git-chip ghost"
        onClick={onNewWorktree}
        disabled={busy}
        title="在隔离的 worktree 里新开一个会话"
      >
        <IconPlus size={12} />
        worktree
      </button>
    </div>
  );
}
