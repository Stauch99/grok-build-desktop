import { describe, expect, it } from "vitest";
import { explorerDirOpen, toggleExplorerDir } from "./explorer";

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
});
