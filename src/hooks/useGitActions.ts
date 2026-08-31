import { useState } from "react";
import { gitCheckout, gitDiscard, gitPull, gitPush, type GitCommandResult, type GitStatus } from "../api";
import { gitWorkDir, isCheckoutableBranch, runBusyGit } from "../lib/git";

export function useGitActions(opts: {
  cwd: string;
  git: GitStatus | null;
  showToast: (msg: string) => void;
  refreshGit: () => Promise<void>;
}) {
  const [gitBusy, setGitBusy] = useState(false);
  const { cwd, git, showToast, refreshGit } = opts;

  function busyOpts(requireRepo: boolean) {
    return {
      dir: gitWorkDir(git, cwd),
      busy: gitBusy,
      isRepo: !!git?.isRepo,
      requireRepo,
      setBusy: setGitBusy,
      toast: showToast,
      refresh: refreshGit,
    };
  }

  async function runGitCommand(run: (dir: string) => Promise<GitCommandResult>, fallback: string) {
    await runBusyGit(busyOpts(true), run, fallback);
  }

  function pullGit() {
    void runGitCommand((dir) => gitPull(dir), "拉取失败");
  }

  function pushGit() {
    void runGitCommand((dir) => gitPush(dir), "推送失败");
  }

  function checkoutBranch(branch: string) {
    if (!isCheckoutableBranch(branch)) return;
    void runGitCommand((dir) => gitCheckout(dir, branch), "切换分支失败");
  }

  async function discardChange(path: string) {
    await runBusyGit(busyOpts(false), (dir) => gitDiscard(dir, path), "丢弃失败");
  }

  return { gitBusy, pullGit, pushGit, checkoutBranch, discardChange };
}
