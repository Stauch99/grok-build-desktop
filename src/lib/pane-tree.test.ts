import { describe, expect, it } from "vitest";
import {
  DRAG_THRESHOLD,
  MAIN_PANE,
  PANE_MIN,
  applyDrop,
  canSplit,
  closePane,
  dragStarted,
  dropZone,
  ensureMainLeaf,
  layoutRects,
  leafIds,
  nextPaneId,
  previewRect,
  resolveDrop,
  singlePane,
  splitLeaf,
} from "./pane-tree";

const wide = { left: 0, top: 0, right: 800, bottom: 600 };
const tiny = { left: 0, top: 0, right: 400, bottom: 300 };

describe("singlePane", () => {
  it("starts as one main leaf", () => {
    expect(singlePane()).toEqual({ type: "leaf", id: MAIN_PANE });
    expect(leafIds(singlePane())).toEqual([MAIN_PANE]);
  });
});

describe("splitLeaf", () => {
  it("splits right into a column with the original first", () => {
    const next = splitLeaf(singlePane(), MAIN_PANE, "right", "p2");
    expect(next).toEqual({
      type: "split",
      id: "s1",
      dir: "col",
      ratio: 0.5,
      first: { type: "leaf", id: MAIN_PANE },
      second: { type: "leaf", id: "p2" },
    });
    expect(leafIds(next!)).toEqual([MAIN_PANE, "p2"]);
  });

  it("splits left so the new pane is first", () => {
    const next = splitLeaf(singlePane(), MAIN_PANE, "left", "p2");
    expect(next?.type === "split" && next.first).toEqual({ type: "leaf", id: "p2" });
    expect(next?.type === "split" && next.second).toEqual({ type: "leaf", id: MAIN_PANE });
  });

  it("splits down into a row", () => {
    const next = splitLeaf(singlePane(), MAIN_PANE, "bottom", "p2");
    expect(next?.type === "split" && next.dir).toBe("row");
    expect(leafIds(next!)).toEqual([MAIN_PANE, "p2"]);
  });

  it("splits a nested leaf without touching the sibling", () => {
    const two = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const three = splitLeaf(two, "p2", "bottom", "p3")!;
    expect(leafIds(three)).toEqual([MAIN_PANE, "p2", "p3"]);
    expect(three.type === "split" && three.second.type === "split" && three.second.dir).toBe("row");
  });
});

describe("closePane", () => {
  it("collapses a split back to the sibling", () => {
    const two = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const closed = closePane(two, "p2");
    expect(closed?.tree).toEqual({ type: "leaf", id: MAIN_PANE });
    expect(closed?.removed).toBe("p2");
  });

  it("refuses to close the last pane", () => {
    expect(closePane(singlePane(), MAIN_PANE)).toBeNull();
  });
});

describe("dropZone", () => {
  it("picks the nearest edge when the pointer is in a corner", () => {
    expect(dropZone({ x: 10, y: 12 }, wide)).toBe("left");
    expect(dropZone({ x: 20, y: 5 }, wide)).toBe("top");
  });

  it("uses the center when away from every edge", () => {
    expect(dropZone({ x: 400, y: 300 }, wide)).toBe("center");
  });

  it("caps the edge band at 80px", () => {
    const huge = { left: 0, top: 0, right: 2000, bottom: 2000 };
    expect(dropZone({ x: 90, y: 1000 }, huge)).toBe("center");
    expect(dropZone({ x: 70, y: 1000 }, huge)).toBe("left");
  });
});

describe("canSplit / previewRect", () => {
  it("refuses a split that would undershoot the pane minimum", () => {
    expect(canSplit(tiny, "left", PANE_MIN)).toBe(false);
    expect(canSplit(wide, "left", PANE_MIN)).toBe(true);
    expect(canSplit(tiny, "bottom", PANE_MIN)).toBe(false);
    expect(canSplit({ left: 0, top: 0, right: 800, bottom: 500 }, "bottom", PANE_MIN)).toBe(true);
  });

  it("previews the landing rectangle for each zone", () => {
    expect(previewRect(wide, "left")).toEqual({ left: 0, top: 0, right: 400, bottom: 600 });
    expect(previewRect(wide, "right")).toEqual({ left: 400, top: 0, right: 800, bottom: 600 });
    expect(previewRect(wide, "center")).toEqual(wide);
  });
});

describe("layoutRects", () => {
  it("divides a column split by ratio", () => {
    const two = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const rects = layoutRects(two, wide);
    expect(rects).toEqual([
      { id: MAIN_PANE, rect: { left: 0, top: 0, right: 400, bottom: 600 } },
      { id: "p2", rect: { left: 400, top: 0, right: 800, bottom: 600 } },
    ]);
  });
});

describe("resolveDrop / applyDrop", () => {
  it("replaces the target leaf when dropping in the center from the sidebar", () => {
    const tree = singlePane();
    const resolved = resolveDrop({
      tree,
      bindings: { [MAIN_PANE]: "a" },
      sessionId: "b",
      targetPane: MAIN_PANE,
      zone: "center",
      targetRect: wide,
    });
    expect(resolved.ok).toBe(true);
    const next = applyDrop(tree, { [MAIN_PANE]: "a" }, resolved)!;
    expect(next.tree).toEqual(tree);
    expect(next.bindings).toEqual({ [MAIN_PANE]: "b" });
    expect(next.focus).toBe(MAIN_PANE);
  });

  it("splits right and focuses the new pane", () => {
    const tree = singlePane();
    const resolved = resolveDrop({
      tree,
      bindings: { [MAIN_PANE]: "a" },
      sessionId: "b",
      targetPane: MAIN_PANE,
      zone: "right",
      targetRect: wide,
    });
    const next = applyDrop(tree, { [MAIN_PANE]: "a" }, resolved)!;
    expect(leafIds(next.tree)).toEqual([MAIN_PANE, "p2"]);
    expect(next.bindings).toEqual({ [MAIN_PANE]: "a", p2: "b" });
    expect(next.focus).toBe("p2");
  });

  it("moves an already-open session instead of duplicating it", () => {
    const tree = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const resolved = resolveDrop({
      tree,
      bindings: { [MAIN_PANE]: "a", p2: "b" },
      sessionId: "b",
      targetPane: MAIN_PANE,
      zone: "center",
      targetRect: { left: 0, top: 0, right: 400, bottom: 600 },
    });
    const next = applyDrop(tree, { [MAIN_PANE]: "a", p2: "b" }, resolved)!;
    expect(leafIds(next.tree)).toEqual([MAIN_PANE]);
    expect(next.bindings).toEqual({ [MAIN_PANE]: "b" });
    expect(next.focus).toBe(MAIN_PANE);
  });

  it("cancels splitting a pane with the session it already shows", () => {
    const tree = singlePane();
    const resolved = resolveDrop({
      tree,
      bindings: { [MAIN_PANE]: "a" },
      sessionId: "a",
      targetPane: MAIN_PANE,
      zone: "right",
      targetRect: wide,
    });
    expect(resolved.ok).toBe(false);
    expect(applyDrop(tree, { [MAIN_PANE]: "a" }, resolved)).toBeNull();
  });

  it("cancels a split that would be smaller than the minimum", () => {
    const resolved = resolveDrop({
      tree: singlePane(),
      bindings: { [MAIN_PANE]: "a" },
      sessionId: "b",
      targetPane: MAIN_PANE,
      zone: "right",
      targetRect: tiny,
    });
    expect(resolved.ok).toBe(false);
  });
});

describe("ensureMainLeaf", () => {
  it("retargets the first remaining leaf to main after main is closed", () => {
    const two = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    const closed = closePane(two, MAIN_PANE)!;
    expect(leafIds(closed.tree)).toEqual(["p2"]);
    const next = ensureMainLeaf(closed.tree, { p2: "b" });
    expect(leafIds(next.tree)).toEqual([MAIN_PANE]);
    expect(next.bindings).toEqual({ [MAIN_PANE]: "b" });
    expect(next.retargetFrom).toBe("p2");
  });

  it("leaves a tree that already has main alone", () => {
    const tree = singlePane();
    const next = ensureMainLeaf(tree, { [MAIN_PANE]: "a" });
    expect(next.tree).toBe(tree);
    expect(next.retargetFrom).toBeNull();
  });
});

describe("nextPaneId", () => {
  it("skips ids already in the tree", () => {
    const two = splitLeaf(singlePane(), MAIN_PANE, "right", "p2")!;
    expect(nextPaneId(two)).toBe("p3");
  });
});

describe("dragStarted", () => {
  it("waits for the click-drag threshold", () => {
    expect(dragStarted(3, 3)).toBe(false);
    expect(dragStarted(DRAG_THRESHOLD, 0)).toBe(true);
  });
});

