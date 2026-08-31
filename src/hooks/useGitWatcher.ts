import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitBranches,
  gitChanges,
  gitListWorktrees,
  gitLog,
  gitStatus,
  workspaceMtime,
  type GitChange,
  type GitCommit,
  type GitStatus,
} from "../api";
import { loadGitSnapshot, parseWorktreePorcelain, workspaceMtimeChanged, type GitWorktree } from "../lib/git";
import { GIT_FALLBACK_MS } from "../lib/persist-cache";

export { GIT_FALLBACK_MS };
/** Kept as an alias of the 30s fallback so older callers still compile. */
export const GIT_POLL_MS = GIT_FALLBACK_MS;

export type GitWatcher = {
  git: GitStatus | null;
  changes: GitChange[];
  commits: GitCommit[];
  branches: string[];
  worktrees: GitWorktree[];
  refresh: (dir?: string) => Promise<void>;
};

export function useGitWatcher(opts: {
  cwd: string;
  onWorkspaceTouched?: (cwd: string) => void;
}): GitWatcher {
  const [git, setGit] = useState<GitStatus | null>(null);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  const onTouchedRef = useRef(opts.onWorkspaceTouched);
  onTouchedRef.current = opts.onWorkspaceTouched;

  const refresh = useCallback(async (dir = opts.cwd) => {
    try {
      const snap = await loadGitSnapshot(dir, {
        status: gitStatus,
        changes: gitChanges,
        log: gitLog,
        branches: gitBranches,
      });
      setGit(snap.git);
      setChanges(snap.changes);
      setCommits(snap.commits);
      setBranches(snap.branches);
      if (snap.git?.isRepo) {
        const porcelain = await gitListWorktrees(dir).catch(() => "");
        setWorktrees(parseWorktreePorcelain(porcelain));
      } else {
        setWorktrees([]);
      }
    } catch {
      setGit(null);
      setChanges([]);
      setCommits([]);
      setBranches([]);
      setWorktrees([]);
    }
  }, [opts.cwd]);

  useEffect(() => {
    void refresh(opts.cwd);
  }, [opts.cwd, refresh]);

  useEffect(() => {
    if (!opts.cwd) return;
    const cwd = opts.cwd;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let fallbackId: number | undefined;

    const onTouched = () => {
      void refresh();
      onTouchedRef.current?.(cwd);
    };

    const startFallback = () => {
      let last = 0;
      const tick = () => {
        void workspaceMtime(cwd)
          .then((n) => {
            if (workspaceMtimeChanged(last, n)) onTouched();
            last = n;
          })
          .catch(() => {});
      };
      tick();
      fallbackId = window.setInterval(tick, GIT_FALLBACK_MS);
    };

    void (async () => {
      try {
        await invoke("watch_workspace", { cwd });
        const stop = await listen<{ cwd: string; at: number }>("workspace-changed", () => {
          onTouched();
        });
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
      } catch {
        if (!cancelled) startFallback();
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      if (fallbackId != null) window.clearInterval(fallbackId);
    };
  }, [opts.cwd, refresh]);

  return { git, changes, commits, branches, worktrees, refresh };
}
