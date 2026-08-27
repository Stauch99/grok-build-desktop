import { describe, expect, it } from "vitest";
import { forkAtSlash, lastTurnFiles, turnFilesAfter } from "./turn-files";
import type { ChatItem } from "./chat";

const items: ChatItem[] = [
  { kind: "user", id: "u1", text: "one" },
  { kind: "tool", id: "t1", title: "edit", status: "completed", diff: { path: "a.ts", newText: "x" } },
  { kind: "user", id: "u2", text: "two" },
  { kind: "tool", id: "t2", title: "write", status: "completed", diff: { path: "b.ts", newText: "y" } },
  { kind: "assistant", id: "a2", text: "done" },
];

describe("turnFilesAfter", () => {
  it("collects tool diffs until the next user turn", () => {
    expect(turnFilesAfter(items, "u1")).toEqual(["a.ts"]);
    expect(turnFilesAfter(items, "u2")).toEqual(["b.ts"]);
  });
});

describe("lastTurnFiles", () => {
  it("uses the latest user turn", () => {
    expect(lastTurnFiles(items)).toEqual(["b.ts"]);
    expect(lastTurnFiles([])).toEqual([]);
  });
});

describe("forkAtSlash", () => {
  it("sends /fork, optionally noting the user turn", () => {
    expect(forkAtSlash()).toBe("/fork");
    expect(forkAtSlash("u2")).toBe("/fork");
  });
});
