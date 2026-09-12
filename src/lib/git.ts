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
  return !!status?.isRepo && !busy && !!status.remote;
}

export type GitSyncKind = "add-remote" | "publish" | "sync";

export function gitSyncKind(status: GitStatus | null): GitSyncKind | null {
  if (!status?.isRepo) return null;
  if (!status.remote) return "add-remote";
  if (!status.hasUpstream) return "publish";
  return "sync";
}

export function gitPullEnabled(status: GitStatus | null, busy = false): boolean {
  return gitSyncKind(status) === "sync" && !busy;
}

export function gitPushEnabled(status: GitStatus | null, busy = false): boolean {
  const kind = gitSyncKind(status);
  return (kind === "publish" || kind === "sync") && !busy;
}

export function gitRemoteUrlOk(url: string): boolean {
  const value = url.trim();
  if (value.length < 8 || value.length > 512) return false;
  if (value.startsWith("-") || /\s/.test(value)) return false;
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(value);
}

/** Collapse raw git stderr into a short, actionable line. */
export function mapGitStderr(stderr: string): string | null {
  const text = stderr.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (
    lower.includes("no configured push destination") ||
    lower.includes("no remote repository specified")
  ) {
    return "当前仓库没有远程地址";
  }
  if (
    lower.includes("couldn't find remote ref") ||
    lower.includes("could not find remote branch")
  ) {
    return "当前分支尚未发布到远程，请先推送";
  }
  if (
    lower.includes("no tracking information") ||
    lower.includes("has no upstream branch") ||
    lower.includes("no upstream configured")
  ) {
    return "当前分支还没有远程跟踪，请先推送";
  }
  return null;
}

export function gitCommandError(res: GitCommandResult, fallback: string): string | null {
  if (res.ok) return null;
  return mapGitStderr(res.stderr) || res.stderr.trim() || fallback;
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
): Promise<string | null> {
  if (!canStartGitBusy(opts)) return null;
  opts.setBusy(true);
  try {
    const err = gitCommandError(await run(opts.dir), fallback);
    if (err) {
      opts.toast(err);
      return err;
    }
    await opts.refresh();
    return null;
  } catch (e) {
    const msg = String(e);
    opts.toast(msg);
    return msg;
  } finally {
    opts.setBusy(false);
  }
}

export type GitSnapshot = {
  git: GitStatus | null;
  changes: GitChange[];
  commits: GitCommit[];
  branches: string[];
  worktrees: GitWorktree[];
};

export type GitSnapshotIo = {
  status: (dir: string) => Promise<GitStatus>;
  changes: (dir: string) => Promise<GitChange[]>;
  log: (dir: string) => Promise<GitCommit[]>;
  branches: (dir: string) => Promise<string[]>;
  worktrees?: (dir: string) => Promise<string>;
};

const EMPTY_SNAPSHOT: GitSnapshot = { git: null, changes: [], commits: [], branches: [], worktrees: [] };

/** Status, dirty files, log, branches, and worktrees in one refresh so history does not lag. */
export async function loadGitSnapshot(dir: string, io: GitSnapshotIo): Promise<GitSnapshot> {
  if (!dir) return EMPTY_SNAPSHOT;
  const git = await io.status(dir);
  if (!git.isRepo) return { git, changes: [], commits: [], branches: [], worktrees: [] };
  const [changes, commits, branches, porcelain] = await Promise.all([
    io.changes(dir).catch(() => [] as GitChange[]),
    io.log(dir).catch(() => [] as GitCommit[]),
    io.branches(dir).catch(() => [] as string[]),
    io.worktrees ? io.worktrees(dir).catch(() => "") : Promise.resolve(""),
  ]);
  return { git, changes, commits, branches, worktrees: parseWorktreePorcelain(porcelain) };
}

/** First mtime sample is a baseline; later ticks refresh only when the value changes. */
export function workspaceMtimeChanged(prev: number, next: number): boolean {
  return Boolean(prev && next && next !== prev);
}
