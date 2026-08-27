import { describe, expect, it } from "vitest";
import { summarizeDiffs } from "./diff-summary";

describe("summarizeDiffs", () => {
  it("is zero for an empty list", () => {
    expect(summarizeDiffs([])).toEqual({ created: 0, modified: 0 });
  });

  it("counts only tool items that carry a diff path", () => {
    expect(
      summarizeDiffs([
        { kind: "assistant" },
        { kind: "tool" },
        { kind: "tool", diff: { oldText: null } },
        { kind: "user", diff: { path: "skip.ts", oldText: null } },
      ]),
    ).toEqual({ created: 0, modified: 0 });
  });

  it("treats null or empty oldText as created", () => {
    expect(
      summarizeDiffs([
        { kind: "tool", diff: { path: "a.ts", oldText: null } },
        { kind: "tool", diff: { path: "b.ts", oldText: "" } },
        { kind: "tool", diff: { path: "c.ts" } },
      ]),
    ).toEqual({ created: 3, modified: 0 });
  });

  it("treats a present oldText as modified", () => {
    expect(
      summarizeDiffs([
        { kind: "tool", diff: { path: "a.ts", oldText: "old" } },
        { kind: "tool", diff: { path: "b.ts", oldText: "\n" } },
      ]),
    ).toEqual({ created: 0, modified: 2 });
  });

  it("mixes created and modified", () => {
    expect(
      summarizeDiffs([
        { kind: "tool", diff: { path: "new.ts", oldText: null } },
        { kind: "tool", diff: { path: "old.ts", oldText: "fn" } },
        { kind: "thought" },
      ]),
    ).toEqual({ created: 1, modified: 1 });
  });
});
