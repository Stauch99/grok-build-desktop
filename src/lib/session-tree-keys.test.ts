import { describe, expect, it } from "vitest";
import { sessionTreeNav, sessionTreeNavIndex } from "./session-tree-keys";

describe("sessionTreeNavIndex", () => {
  it("moves with arrows and jumps with Home/End", () => {
    expect(sessionTreeNavIndex("ArrowDown", { index: 1, count: 4 })).toBe(2);
    expect(sessionTreeNavIndex("ArrowUp", { index: 1, count: 4 })).toBe(0);
    expect(sessionTreeNavIndex("Home", { index: 2, count: 4 })).toBe(0);
    expect(sessionTreeNavIndex("End", { index: 0, count: 4 })).toBe(3);
    expect(sessionTreeNavIndex("Tab", { index: 1, count: 4 })).toBeNull();
  });
});

describe("sessionTreeNav", () => {
  it("expands a collapsed parent on ArrowRight and collapses an open one on ArrowLeft", () => {
    expect(sessionTreeNav("ArrowRight", { index: 1, count: 4, hasKids: true, expanded: false }))
      .toEqual({ type: "toggle-expand" });
    expect(sessionTreeNav("ArrowLeft", { index: 1, count: 4, hasKids: true, expanded: true }))
      .toEqual({ type: "toggle-expand" });
  });

  it("does not toggle a leaf or an already-open/closed node in the wrong direction", () => {
    expect(sessionTreeNav("ArrowRight", { index: 1, count: 4, hasKids: false, expanded: false }))
      .toEqual({ type: "move", index: 2 });
    expect(sessionTreeNav("ArrowRight", { index: 1, count: 4, hasKids: true, expanded: true }))
      .toEqual({ type: "move", index: 2 });
    expect(sessionTreeNav("ArrowLeft", { index: 1, count: 4, hasKids: true, expanded: false }))
      .toEqual({ type: "move", index: 0 });
  });
});
