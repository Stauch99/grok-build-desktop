import type { GitChange, GitCommit, GitStatus } from "../api";
import { ChangesPanel } from "./ChangesPanel";
import { GitBar } from "./GitBar";
import { GitHistory } from "./GitHistory";
import type { GitWorktree } from "../lib/git";
import { sameCwd } from "../lib/inbox";
import { basename } from "../lib/text";
import { useT } from "../lib/locale-context";
import { IconGrokPlus } from "../grok-icons";

export type GitPaneProps = {
  status: GitStatus | null;
  changes: GitChange[];
  commits: GitCommit[];
  branches: string[];
  worktrees?: GitWorktree[];
  cwd?: string;
  busy?: boolean;
  sessionBranch?: string | null;
  onNewWorktree: () => void;
  onSwitchWorktree?: (path: string) => void;
  onCheckout?: (branch: string) => void;
  onCommitted?: () => void;
  onToast?: (msg: string) => void;
  onPreview: (abs: string) => void;
  onReveal: (abs: string) => void;
  onRefresh: () => void;
  onPull: () => void;
  onPush: () => void;
  onDiscard: (path: string) => void;
};

/** Git peer pane: bar, dirty files, worktrees, and a log. */
export function GitPane({
  status,
  changes,
  commits,
  branches,
  worktrees = [],
  cwd,
  busy,
  sessionBranch,
  onNewWorktree,
  onSwitchWorktree,
  onCheckout,
  onCommitted,
  onToast,
  onPreview,
  onReveal,
  onRefresh,
  onPull,
  onPush,
  onDiscard,
}: GitPaneProps) {
  const t = useT();
  const currentPath = cwd || status?.root || "";
  return (
    <div className="review-stack git-pane">
      <GitBar
        status={status}
        busy={busy}
        sessionBranch={sessionBranch}
        branches={branches}
        worktrees={worktrees}
        cwd={cwd}
        onNewWorktree={onNewWorktree}
        onSwitchWorktree={onSwitchWorktree}
        onCheckout={onCheckout}
        onCommitted={onCommitted}
        onToast={onToast}
        onPull={onPull}
        onPush={onPush}
      />
      <div className="git-pane-body">
        <ChangesPanel
          changes={changes}
          isRepo={!!status?.isRepo}
          onPreview={onPreview}
          onReveal={onReveal}
          onRefresh={onRefresh}
          onDiscard={onDiscard}
        />
        {status?.isRepo ? (
          <section>
            <h3>{t("git.worktrees")}</h3>
            {worktrees.length > 0 ? (
              <ul className="git-worktree-list">
                {worktrees.map((wt) => {
                  const current = sameCwd(wt.path, currentPath);
                  return (
                    <li key={wt.path}>
                      <button
                        type="button"
                        disabled={!!busy || current || !onSwitchWorktree}
                        title={current ? t("git.currentWorktree") : t("git.switchWorktree")}
                        onClick={() => onSwitchWorktree?.(wt.path)}
                      >
                        <span className="git-worktree-name">{basename(wt.path) || wt.path}</span>
                        <span className="git-worktree-branch">{wt.branch}</span>
                        {current ? (
                          <span className="git-worktree-now">{t("git.currentWorktree")}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hub-meta">{t("git.worktree")}</p>
            )}
            <button
              type="button"
              className="git-chip ghost git-worktree-add"
              disabled={!!busy}
              onClick={onNewWorktree}
            >
              <span className="git-chip-inner">
                <IconGrokPlus size={14} />
                {t("git.newWorktree")}
              </span>
            </button>
          </section>
        ) : null}
        <GitHistory
          commits={commits}
          branches={branches}
          heading={t("git.log")}
          currentBranch={status?.branch}
          onCheckout={onCheckout}
        />
      </div>
    </div>
  );
}
