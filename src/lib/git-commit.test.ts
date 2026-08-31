import { describe, expect, it } from "vitest";
import { branchMismatchToast, commitMessageOk } from "./git-commit";

describe("commitMessageOk", () => {
  it("rejects empty and whitespace", () => {
    expect(commitMessageOk("")).toBe(false);
    expect(commitMessageOk("   ")).toBe(false);
    expect(commitMessageOk("\n\t")).toBe(false);
  });

  it("accepts a non-empty message", () => {
    expect(commitMessageOk("fix login")).toBe(true);
    expect(commitMessageOk("  fix login  ")).toBe(true);
  });
});

describe("branchMismatchToast", () => {
  it("toasts when the session worktree branch differs", () => {
    expect(branchMismatchToast("feat/a", "main")).toBe("当前会话绑定另一条分支");
  });

  it("is silent when branches match or session branch is missing", () => {
    expect(branchMismatchToast("main", "main")).toBeNull();
    expect(branchMismatchToast("", "main")).toBeNull();
    expect(branchMismatchToast(undefined, "main")).toBeNull();
  });
});
