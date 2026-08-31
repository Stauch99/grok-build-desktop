import type { GitCommit } from "../api";
import { isCheckoutableBranch, localGitBranches } from "../lib/git";
import { useT } from "../lib/locale-context";

export type GitHistoryProps = {
  commits: GitCommit[];
  branches: string[];
  heading?: string;
  currentBranch?: string;
  onCheckout?: (branch: string) => void;
};

/**
 * Git log + local branches. Branch names check out when `onCheckout` is set.
 */
export function GitHistory({
  commits,
  branches,
  heading = "Git",
  currentBranch,
  onCheckout,
}: GitHistoryProps) {
  const t = useT();
  const local = localGitBranches(branches).filter(isCheckoutableBranch);
  if (local.length === 0 && commits.length === 0) return null;

  return (
    <section>
      <h3>{heading}</h3>
      {local.length > 0 ? (
        onCheckout ? (
          <div className="git-branch-pills" role="group" aria-label={t("git.branches")}>
            {local.map((b) => {
              const current = b === currentBranch;
              return (
                <button
                  key={b}
                  type="button"
                  className={current ? "is-current" : undefined}
                  disabled={current}
                  title={current ? t("git.currentWorktree") : t("git.checkoutBranch", { branch: b })}
                  onClick={() => onCheckout(b)}
                >
                  {b}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="hub-meta" aria-label={t("git.branches")}>
            {local.slice(0, 8).join(" · ")}
            {local.length > 8 ? ` +${local.length - 8}` : ""}
          </p>
        )
      ) : null}
      {commits.length > 0 ? (
        <ul className="git-log">
          {commits.map((c) => (
            <li key={c.hash}>
              <code>{c.hash.slice(0, 7)}</code>
              <span>{c.subject}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
