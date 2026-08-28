import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitBranches,
  gitChanges,
  gitLog,
  gitStatus,
  workspaceMtime,
  type GitChange,
  type GitCommit,
  type GitStatus,
} from "../api";
import { workspaceMtimeChanged } from "../lib/git";

/** Poll interval until Task 14 replaces this with a filesystem watcher. */
export const GIT_POLL_MS = 4000;

export type GitWatcher = {
  git: GitStatus | null;
  changes: GitChange[];
  commits: GitCommit[];
  branches: string[];
  refresh: (dir?: string) => Promise<void>;
};

export function useGitWatcher(opts: {
  cwd: string;
  historyKey?: unknown;
  onWorkspaceTouched?: (cwd: string) => void;
}): GitWatcher {
  const [git, setGit] = useState<GitStatus | null>(null);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const onTouchedRef = useRef(opts.onWorkspaceTouched);
  onTouchedRef.current = opts.onWorkspaceTouched;

  const refresh = useCallback(async (dir = opts.cwd) => {
    if (!dir) {
      setGit(null);
      setChanges([]);
      return;
    }
    try {
      const status = await gitStatus(dir);
      setGit(status);
      setChanges(status.isRepo ? await gitChanges(dir) : []);
    } catch {
      setGit(null);
      setChanges([]);
    }
  }, [opts.cwd]);

  useEffect(() => {
    void refresh(opts.cwd);
  }, [opts.cwd, refresh]);

  useEffect(() => {
    if (!opts.cwd) return;
    const cwd = opts.cwd;
    let last = 0;
    const tick = () => {
      void workspaceMtime(cwd)
        .then((n) => {
          if (workspaceMtimeChanged(last, n)) {
            void refresh();
            onTouchedRef.current?.(cwd);
          }
          last = n;
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, GIT_POLL_MS);
    return () => window.clearInterval(id);
  }, [opts.cwd, refresh]);

  useEffect(() => {
    if (!opts.cwd || !git?.isRepo) {
      setCommits([]);
      setBranches([]);
      return;
    }
    const cwd = opts.cwd;
    void gitLog(cwd).then(setCommits).catch(() => setCommits([]));
    void gitBranches(cwd).then(setBranches).catch(() => setBranches([]));
  }, [opts.cwd, git?.isRepo, opts.historyKey]);

  return { git, changes, commits, branches, refresh };
}
