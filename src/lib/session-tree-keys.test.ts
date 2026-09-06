import { describe, expect, it } from "vitest";
import { sessionTreeNavIndex } from "./session-tree-keys";

describe("sessionTreeNavIndex", () => {
  it("moves with arrows and jumps with Home/End", () => {
    expect(sessionTreeNavIndex("ArrowDown", { index: 1, count: 4 })).toBe(2);
    expect(sessionTreeNavIndex("ArrowUp", { index: 1, count: 4 })).toBe(0);
    expect(sessionTreeNavIndex("Home", { index: 2, count: 4 })).toBe(0);
    expect(sessionTreeNavIndex("End", { index: 0, count: 4 })).toBe(3);
    expect(sessionTreeNavIndex("Tab", { index: 1, count: 4 })).toBeNull();
  });
});
