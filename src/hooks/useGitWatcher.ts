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
import { loadGitSnapshot, workspaceMtimeChanged, type GitWorktree } from "../lib/git";
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
  const [snap, setSnap] = useState<{
    git: GitStatus | null;
    changes: GitChange[];
    commits: GitCommit[];
    branches: string[];
    worktrees: GitWorktree[];
  }>({ git: null, changes: [], commits: [], branches: [], worktrees: [] });
  const onTouchedRef = useRef(opts.onWorkspaceTouched);
  onTouchedRef.current = opts.onWorkspaceTouched;

  const refresh = useCallback(async (dir = opts.cwd) => {
    try {
      const next = await loadGitSnapshot(dir, {
        status: gitStatus,
        changes: gitChanges,
        log: gitLog,
        branches: gitBranches,
        worktrees: gitListWorktrees,
      });
      setSnap({
        git: next.git,
        changes: next.changes,
        commits: next.commits,
        branches: next.branches,
        worktrees: next.git?.isRepo ? next.worktrees : [],
      });
    } catch {
      setSnap({ git: null, changes: [], commits: [], branches: [], worktrees: [] });
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

  return { ...snap, refresh };
}
