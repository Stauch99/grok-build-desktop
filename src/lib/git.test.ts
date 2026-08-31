import { describe, expect, it, vi } from "vitest";
import type { GitChange, GitStatus } from "../api";
import {
  branchLabel,
  canDiscardChange,
  canStartGitBusy,
  changePreviewTarget,
  discardConfirm,
  gitCommandError,
  gitRemoteEnabled,
  gitWorkDir,
  isCheckoutableBranch,
  isClean,
  loadGitSnapshot,
  localGitBranches,
  parseWorktreePorcelain,
  runBusyGit,
  statusMark,
  totalChanges,
  worktreeName,
  workspaceMtimeChanged,
} from "./git";

const change = (over: Partial<GitChange> = {}): GitChange => ({
  path: "src/App.tsx",
  abs: "/repo/src/App.tsx",
  added: 3,
  removed: 1,
  status: "modified",
  ...over,
});

const status = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true,
  root: "/repo",
  branch: "main",
  dirty: 2,
  ahead: 0,
  behind: 0,
  ...over,
});

describe("totalChanges", () => {
  it("sums files and line counts", () => {
    expect(totalChanges([change(), change({ path: "b", added: 10, removed: 2 })])).toEqual({
      files: 2,
      added: 13,
      removed: 3,
    });
  });

  it("is zero for an empty list", () => {
    expect(totalChanges([])).toEqual({ files: 0, added: 0, removed: 0 });
  });
});

describe("branchLabel", () => {
  it("is empty outside a repo", () => {
    expect(branchLabel(null)).toBe("");
    expect(branchLabel(status({ isRepo: false }))).toBe("");
  });

  it("shows just the branch when in sync", () => {
    expect(branchLabel(status())).toBe("main");
  });

  it("appends ahead and behind counts", () => {
    expect(branchLabel(status({ ahead: 2, behind: 1 }))).toBe("main ↑2 ↓1");
  });

  it("falls back to HEAD when detached", () => {
    expect(branchLabel(status({ branch: "" }))).toBe("HEAD");
  });
});

describe("statusMark", () => {
  it("maps each status to a single letter", () => {
    expect(statusMark("modified")).toBe("M");
    expect(statusMark("added")).toBe("A");
    expect(statusMark("deleted")).toBe("D");
    expect(statusMark("renamed")).toBe("R");
    expect(statusMark("untracked")).toBe("?");
  });
});

describe("worktreeName", () => {
  it("slugifies an ascii title", () => {
    expect(worktreeName("Fix the Login Bug")).toBe("fix-the-login-bug");
  });

  it("drops leading punctuation and trailing dashes", () => {
    expect(worktreeName("--.weird name--")).toBe("weird-name");
  });

  it("falls back to a timestamp when nothing ascii survives", () => {
    const name = worktreeName("修一下登录", Date.UTC(2026, 7, 15, 6, 30));
    expect(name).toMatch(/^wt-\d{4} ?\d*/);
    expect(name.startsWith("wt-")).toBe(true);
  });

  it("caps the length", () => {
    expect(worktreeName("a".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("parseWorktreePorcelain", () => {
  it("reads path and branch from porcelain records", () => {
    expect(
      parseWorktreePorcelain(
        [
          "worktree /repo",
          "HEAD abc",
          "branch refs/heads/main",
          "",
          "worktree /repo/.worktrees/fix",
          "HEAD def",
          "branch refs/heads/grok/fix",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      { path: "/repo", branch: "main" },
      { path: "/repo/.worktrees/fix", branch: "grok/fix" },
    ]);
  });

  it("skips bare records and labels detached HEAD", () => {
    expect(
      parseWorktreePorcelain("worktree /repo/.git\nbare\n\nworktree /wt\nHEAD abc\ndetached\n"),
    ).toEqual([{ path: "/wt", branch: "HEAD" }]);
  });
});

describe("localGitBranches", () => {
  it("drops remotes and keeps local names", () => {
    expect(localGitBranches(["main", "remotes/origin/main", "feat", "HEAD"])).toEqual(["main", "feat"]);
  });
});

describe("isCheckoutableBranch", () => {
  it("allows local refs and rejects flags or remotes", () => {
    expect(isCheckoutableBranch("main")).toBe(true);
    expect(isCheckoutableBranch("grok/fix")).toBe(true);
    expect(isCheckoutableBranch("-b")).toBe(false);
    expect(isCheckoutableBranch("remotes/origin/main")).toBe(false);
    expect(isCheckoutableBranch("foo;bar")).toBe(false);
  });
});

describe("workspaceMtimeChanged", () => {
  it("ignores the first sample and equal ticks", () => {
    expect(workspaceMtimeChanged(0, 10)).toBe(false);
    expect(workspaceMtimeChanged(10, 10)).toBe(false);
    expect(workspaceMtimeChanged(10, 0)).toBe(false);
  });

  it("fires when a later sample differs", () => {
    expect(workspaceMtimeChanged(10, 11)).toBe(true);
  });
});

describe("isClean", () => {
  it("is false outside a repo", () => {
    expect(isClean(null)).toBe(false);
  });

  it("tracks the dirty count", () => {
    expect(isClean(status({ dirty: 0 }))).toBe(true);
    expect(isClean(status({ dirty: 3 }))).toBe(false);
  });
});

describe("canDiscardChange", () => {
  it("allows modified, untracked, and added files", () => {
    expect(canDiscardChange("modified")).toBe(true);
    expect(canDiscardChange("untracked")).toBe(true);
    expect(canDiscardChange("added")).toBe(true);
  });

  it("skips deleted files because restore already covers them", () => {
    expect(canDiscardChange("deleted")).toBe(false);
  });

  it("skips renamed files", () => {
    expect(canDiscardChange("renamed")).toBe(false);
  });
});

describe("discardConfirm", () => {
  it("asks to discard local changes for the path", () => {
    expect(discardConfirm("src/App.tsx")).toBe("丢弃对 src/App.tsx 的本地改动？");
  });
});

describe("changePreviewTarget", () => {
  it("prefers the absolute path when present", () => {
    expect(changePreviewTarget(change())).toBe("/repo/src/App.tsx");
    expect(changePreviewTarget(change({ abs: "", path: "rel.ts" }))).toBe("rel.ts");
  });
});

describe("gitRemoteEnabled", () => {
  it("is off outside a repo or while busy", () => {
    expect(gitRemoteEnabled(null, false)).toBe(false);
    expect(gitRemoteEnabled(status({ isRepo: false }), false)).toBe(false);
    expect(gitRemoteEnabled(status(), true)).toBe(false);
  });

  it("is on for a repo that is not busy", () => {
    expect(gitRemoteEnabled(status(), false)).toBe(true);
    expect(gitRemoteEnabled(status({ ahead: 0, behind: 0 }))).toBe(true);
  });
});

describe("gitCommandError", () => {
  it("is silent when the command succeeded", () => {
    expect(gitCommandError({ ok: true, code: 0, stderr: "" }, "拉取失败")).toBeNull();
  });

  it("prefers stderr and falls back to the Chinese copy", () => {
    expect(gitCommandError({ ok: false, code: 1, stderr: " conflict\n" }, "拉取失败")).toBe("conflict");
    expect(gitCommandError({ ok: false, code: 1, stderr: "  " }, "推送失败")).toBe("推送失败");
  });
});

describe("gitWorkDir", () => {
  it("prefers the git root over cwd", () => {
    expect(gitWorkDir({ root: "/repo" }, "/cwd")).toBe("/repo");
    expect(gitWorkDir(null, "/cwd")).toBe("/cwd");
    expect(gitWorkDir({ root: "" }, "/cwd")).toBe("/cwd");
  });
});

describe("canStartGitBusy", () => {
  it("blocks when there is no dir or the runner is already busy", () => {
    expect(canStartGitBusy({ dir: "", busy: false, isRepo: true })).toBe(false);
    expect(canStartGitBusy({ dir: "/repo", busy: true, isRepo: true })).toBe(false);
  });

  it("requires a repo for pull/push and not for discard", () => {
    expect(canStartGitBusy({ dir: "/repo", busy: false, isRepo: false, requireRepo: true })).toBe(false);
    expect(canStartGitBusy({ dir: "/repo", busy: false, isRepo: true, requireRepo: true })).toBe(true);
    expect(canStartGitBusy({ dir: "/repo", busy: false, isRepo: false, requireRepo: false })).toBe(true);
  });
});

describe("runBusyGit", () => {
  it("toasts stderr and skips refresh on failure", async () => {
    const setBusy = vi.fn();
    const toast = vi.fn();
    const refresh = vi.fn();
    await runBusyGit(
      { dir: "/repo", busy: false, isRepo: true, setBusy, toast, refresh },
      async () => ({ ok: false, code: 1, stderr: "no upstream" }),
      "拉取失败",
    );
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
    expect(toast).toHaveBeenCalledWith("no upstream");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a successful command", async () => {
    const setBusy = vi.fn();
    const toast = vi.fn();
    const refresh = vi.fn(async () => {});
    await runBusyGit(
      { dir: "/repo", busy: false, isRepo: true, setBusy, toast, refresh },
      async () => ({ ok: true, code: 0, stderr: "" }),
      "推送失败",
    );
    expect(toast).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("toasts thrown errors and always clears busy", async () => {
    const setBusy = vi.fn();
    const toast = vi.fn();
    await runBusyGit(
      { dir: "/repo", busy: false, isRepo: true, setBusy, toast, refresh: async () => {} },
      async () => {
        throw new Error("network");
      },
      "拉取失败",
    );
    expect(toast).toHaveBeenCalledWith("Error: network");
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("does nothing when already busy or not a repo", async () => {
    const setBusy = vi.fn();
    await runBusyGit(
      { dir: "/repo", busy: true, isRepo: true, setBusy, toast: () => {}, refresh: async () => {} },
      async () => ({ ok: true, code: 0, stderr: "" }),
      "拉取失败",
    );
    expect(setBusy).not.toHaveBeenCalled();
    await runBusyGit(
      { dir: "/repo", busy: false, isRepo: false, requireRepo: true, setBusy, toast: () => {}, refresh: async () => {} },
      async () => ({ ok: true, code: 0, stderr: "" }),
      "拉取失败",
    );
    expect(setBusy).not.toHaveBeenCalled();
  });
});

describe("loadGitSnapshot", () => {
  const repo = status();
  const io = {
    status: async () => repo,
    changes: async () => [change()],
    log: async () => [{ hash: "abc", subject: "fix", date: "2026-08-30" }],
    branches: async () => ["main", "feat"],
  };

  it("clears everything when there is no directory", () => {
    return expect(loadGitSnapshot("", io)).resolves.toEqual({
      git: null, changes: [], commits: [], branches: [],
    });
  });

  it("loads status, changes, commits, and branches together for a repo", async () => {
    const snap = await loadGitSnapshot("/repo", io);
    expect(snap.git).toEqual(repo);
    expect(snap.changes).toHaveLength(1);
    expect(snap.commits).toEqual([{ hash: "abc", subject: "fix", date: "2026-08-30" }]);
    expect(snap.branches).toEqual(["main", "feat"]);
  });

  it("keeps status but clears history when the folder is not a repo", async () => {
    const snap = await loadGitSnapshot("/tmp", {
      ...io,
      status: async () => status({ isRepo: false }),
    });
    expect(snap.git?.isRepo).toBe(false);
    expect(snap.changes).toEqual([]);
    expect(snap.commits).toEqual([]);
    expect(snap.branches).toEqual([]);
  });
});
