import { describe, expect, it } from "vitest";
import { FILE_TREE_WINDOW, windowedList } from "./file-tree-window";

describe("windowedList", () => {
  it("leaves a short list untouched", () => {
    expect(windowedList(["a", "b"], 10)).toEqual({ shown: ["a", "b"], hidden: 0 });
  });

  it("caps a long list and reports how many were hidden", () => {
    const items = Array.from({ length: FILE_TREE_WINDOW + 3 }, (_, i) => i);
    const next = windowedList(items);
    expect(next.shown).toHaveLength(FILE_TREE_WINDOW);
    expect(next.hidden).toBe(3);
    expect(next.shown[0]).toBe(0);
  });
});
