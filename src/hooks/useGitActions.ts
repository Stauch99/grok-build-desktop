import { useState } from "react";
import { gitCheckout, gitDiscard, gitPull, gitPush, type GitCommandResult, type GitStatus } from "../api";
import { gitWorkDir, isCheckoutableBranch, runBusyGit } from "../lib/git";
import { t, type Locale } from "../lib/i18n";

export function useGitActions(opts: {
  cwd: string;
  git: GitStatus | null;
  showToast: (msg: string) => void;
  refreshGit: () => Promise<void>;
  locale?: Locale;
}) {
  const [gitBusy, setGitBusy] = useState(false);
  const { cwd, git, showToast, refreshGit, locale = "zh" } = opts;

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
    return runBusyGit(busyOpts(true), run, fallback);
  }

  function pullGit() {
    return runGitCommand((dir) => gitPull(dir), t(locale, "git.pullFail"));
  }

  function pushGit() {
    return runGitCommand((dir) => gitPush(dir), t(locale, "git.pushFail"));
  }

  function checkoutBranch(branch: string) {
    if (!isCheckoutableBranch(branch)) return;
    void runGitCommand((dir) => gitCheckout(dir, branch), t(locale, "git.checkoutFail"));
  }

  async function discardChange(path: string) {
    await runBusyGit(busyOpts(false), (dir) => gitDiscard(dir, path), t(locale, "git.discardFail"));
  }

  return { gitBusy, pullGit, pushGit, checkoutBranch, discardChange };
}
