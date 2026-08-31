import type { GitChange, GitChangeStatus, GitCommandResult, GitCommit, GitStatus } from "../api";

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

const DISCARDABLE = new Set<GitChangeStatus>(["modified", "untracked", "added"]);

/** Discard is for local edits; deleted files are restored, not discarded. */
export function canDiscardChange(status: GitChangeStatus): boolean {
  return DISCARDABLE.has(status);
}

export function discardConfirm(path: string): string {
  return `丢弃对 ${path} 的本地改动？`;
}

export function changePreviewTarget(change: GitChange): string {
  return change.abs || change.path;
}

export function gitRemoteEnabled(status: GitStatus | null, busy = false): boolean {
  return !!status?.isRepo && !busy;
}

export function gitCommandError(res: GitCommandResult, fallback: string): string | null {
  if (res.ok) return null;
  return res.stderr.trim() || fallback;
}

export function gitWorkDir(git: { root?: string } | null, cwd: string): string {
  return git?.root || cwd;
}

export type GitWorktree = { path: string; branch: string };

/** `git worktree list --porcelain` records. Bare repos are omitted. */
export function parseWorktreePorcelain(text: string): GitWorktree[] {
  const out: GitWorktree[] = [];
  let path = "";
  let branch = "";
  let skip = false;
  const flush = () => {
    if (path && !skip) out.push({ path, branch: branch || "HEAD" });
    path = "";
    branch = "";
    skip = false;
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
    else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line === "detached") branch = "HEAD";
    else if (line === "bare") skip = true;
  }
  flush();
  return out;
}

export function localGitBranches(names: string[]): string[] {
  return names.filter((n) => n && n !== "HEAD" && !n.startsWith("remotes/"));
}

export function isCheckoutableBranch(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 200 || n.startsWith("-") || n.startsWith("remotes/") || n.includes("..")) return false;
  return /^[A-Za-z0-9._/-]+$/.test(n);
}

export type GitBusyGate = {
  dir: string;
  busy: boolean;
  isRepo?: boolean;
  requireRepo?: boolean;
};

export function canStartGitBusy(gate: GitBusyGate): boolean {
  if (!gate.dir || gate.busy) return false;
  if ((gate.requireRepo ?? true) && !gate.isRepo) return false;
  return true;
}

export type GitBusyRun = {
  dir: string;
  busy: boolean;
  isRepo?: boolean;
  requireRepo?: boolean;
  setBusy: (busy: boolean) => void;
  toast: (msg: string) => void;
  refresh: () => Promise<void>;
};

export async function runBusyGit(
  opts: GitBusyRun,
  run: (dir: string) => Promise<GitCommandResult>,
  fallback: string,
): Promise<void> {
  if (!canStartGitBusy(opts)) return;
  opts.setBusy(true);
  try {
    const err = gitCommandError(await run(opts.dir), fallback);
    if (err) opts.toast(err);
    else await opts.refresh();
  } catch (e) {
    opts.toast(String(e));
  } finally {
    opts.setBusy(false);
  }
}

export type GitSnapshot = {
  git: GitStatus | null;
  changes: GitChange[];
  commits: GitCommit[];
  branches: string[];
};

export type GitSnapshotIo = {
  status: (dir: string) => Promise<GitStatus>;
  changes: (dir: string) => Promise<GitChange[]>;
  log: (dir: string) => Promise<GitCommit[]>;
  branches: (dir: string) => Promise<string[]>;
};

const EMPTY_SNAPSHOT: GitSnapshot = { git: null, changes: [], commits: [], branches: [] };

/** Status, dirty files, log, and branches in one refresh so history does not lag. */
export async function loadGitSnapshot(dir: string, io: GitSnapshotIo): Promise<GitSnapshot> {
  if (!dir) return EMPTY_SNAPSHOT;
  const git = await io.status(dir);
  if (!git.isRepo) return { git, changes: [], commits: [], branches: [] };
  const [changes, commits, branches] = await Promise.all([
    io.changes(dir).catch(() => [] as GitChange[]),
    io.log(dir).catch(() => [] as GitCommit[]),
    io.branches(dir).catch(() => [] as string[]),
  ]);
  return { git, changes, commits, branches };
}

/** First mtime sample is a baseline; later ticks refresh only when the value changes. */
export function workspaceMtimeChanged(prev: number, next: number): boolean {
  return Boolean(prev && next && next !== prev);
}
