import { describe, expect, it } from "vitest";
import {
  FILE_TREE_VIRTUALIZE_AFTER,
  WORKSPACE_ENTRY_CAP,
  flattenFileTreeRows,
  shouldVirtualizeFileTree,
} from "./file-tree-window";

describe("file tree rows", () => {
  it("leaves a short list unvirtualized", () => {
    const rows = flattenFileTreeRows(
      [{ name: "src", path: "/p/src", kind: "dir" }],
      [{ name: "a.ts", path: "/p/a.ts", kind: "file" }],
    );
    expect(shouldVirtualizeFileTree(rows)).toBe(false);
    expect(rows[0]).toEqual({ kind: "heading", key: "folders", labelKey: "file.folders" });
  });

  it("virtualizes after the thread threshold and keeps a large backend cap", () => {
    const files = Array.from({ length: FILE_TREE_VIRTUALIZE_AFTER + 3 }, (_, i) => ({
      name: `${i}.ts`,
      path: `/p/${i}.ts`,
      kind: "file" as const,
    }));
    expect(shouldVirtualizeFileTree(flattenFileTreeRows([], files))).toBe(true);
    expect(WORKSPACE_ENTRY_CAP).toBe(2000);
  });
});
