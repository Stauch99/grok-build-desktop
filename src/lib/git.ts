import type { GitChange, GitChangeStatus, GitStatus } from "../api";

export type ChangeTotals = { files: number; added: number; removed: number };

export function totalChanges(changes: GitChange[]): ChangeTotals {
  return changes.reduce<ChangeTotals>(
    (acc, c) => ({
      files: acc.files + 1,
      added: acc.added + (Number.isFinite(c.added) ? c.added : 0),
      removed: acc.removed + (Number.isFinite(c.removed) ? c.removed : 0),
    }),
    { files: 0, added: 0, removed: 0 },
  );
}

/** Short branch line for the status bar. Empty string when there is no repo. */
export function branchLabel(status: GitStatus | null): string {
  if (!status?.isRepo) return "";
  const parts = [status.branch || "HEAD"];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  return parts.join(" ");
}

const MARKS: Record<GitChangeStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

export function statusMark(status: GitChangeStatus): string {
  return MARKS[status] ?? "M";
}

/**
 * Turn a session title into a git-safe worktree name.
 * Non-ASCII (e.g. Chinese titles) collapses away, so fall back to a timestamp.
 */
export function worktreeName(title: string, now = Date.now()): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "")
    .slice(0, 40);
  if (slug.length >= 2) return slug;
  return `wt-${new Date(now).toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
}

/** True when the working tree has nothing to review. */
export function isClean(status: GitStatus | null): boolean {
  return !!status?.isRepo && status.dirty === 0;
}
