import { describe, expect, it } from "vitest";
import { explorerDirOpen, flattenExplorerRows, toggleExplorerDir } from "./explorer";

describe("explorer folder expansion", () => {
  it("opens a closed folder and closes an open one without disturbing siblings", () => {
    const opened = toggleExplorerDir(["/work/src"], "/work/lib");
    expect(opened).toEqual(["/work/src", "/work/lib"]);
    expect(explorerDirOpen(opened, "/work/lib")).toBe(true);
    expect(toggleExplorerDir(opened, "/work/src")).toEqual(["/work/lib"]);
  });

  it("treats a missing path as closed", () => {
    expect(explorerDirOpen([], "/work")).toBe(false);
    expect(explorerDirOpen(["/work/src"], "/work")).toBe(false);
  });

  it("flattens expanded folders including loading placeholders", () => {
    const rows = flattenExplorerRows(
      [
        { name: "src", path: "/work/src", kind: "dir" },
        { name: "a.ts", path: "/work/a.ts", kind: "file" },
      ],
      ["/work/src"],
      { "/work/src": [{ name: "lib.ts", path: "/work/src/lib.ts", kind: "file" }] },
    );
    expect(rows.map((r) => r.key)).toEqual(["/work/src", "/work/src/lib.ts", "/work/a.ts"]);
    expect(
      flattenExplorerRows([{ name: "src", path: "/work/src", kind: "dir" }], ["/work/src"], {}).some(
        (r) => r.kind === "status" && r.status === "loading",
      ),
    ).toBe(true);
  });
});
