import type { GitCommit } from "../api";

export type GitHistoryProps = {
  commits: GitCommit[];
  branches: string[];
};

/**
 * Read-only git log + branch names. Not a git client.
 */
export function GitHistory({ commits, branches }: GitHistoryProps) {
  if (branches.length === 0 && commits.length === 0) return null;

  return (
    <section>
      <h3>Git</h3>
      {branches.length > 0 ? (
        <p className="hub-meta" aria-label="分支">
          {branches.slice(0, 8).join(" · ")}
          {branches.length > 8 ? ` +${branches.length - 8}` : ""}
        </p>
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
