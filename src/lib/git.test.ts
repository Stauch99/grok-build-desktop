import { describe, expect, it } from "vitest";
import type { GitChange, GitStatus } from "../api";
import { branchLabel, isClean, statusMark, totalChanges, worktreeName } from "./git";

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

describe("isClean", () => {
  it("is false outside a repo", () => {
    expect(isClean(null)).toBe(false);
  });

  it("tracks the dirty count", () => {
    expect(isClean(status({ dirty: 0 }))).toBe(true);
    expect(isClean(status({ dirty: 3 }))).toBe(false);
  });
});
