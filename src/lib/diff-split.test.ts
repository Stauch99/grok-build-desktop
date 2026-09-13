import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";
import {
  DIFF_VIEW_KEY,
  loadDiffViewMode,
  readDiffViewMode,
  splitRows,
  writeDiffViewMode,
} from "./diff-split";

describe("splitRows", () => {
  it("renders context lines on both sides", () => {
    const rows = splitRows([{ kind: "ctx", text: "same", oldLine: 3, newLine: 5 }]);
    expect(rows).toEqual([
      {
        kind: "line",
        left: { text: "same", line: 3, tone: "ctx" },
        right: { text: "same", line: 5, tone: "ctx" },
      },
    ]);
  });

  it("pairs deletions with the additions that follow", () => {
    const rows = splitRows([
      { kind: "del", text: "old a", oldLine: 10 },
      { kind: "del", text: "old b", oldLine: 11 },
      { kind: "add", text: "new a", newLine: 10 },
    ]);
    expect(rows).toEqual([
      {
        kind: "line",
        left: { text: "old a", line: 10, tone: "del" },
        right: { text: "new a", line: 10, tone: "add" },
      },
      {
        kind: "line",
        left: { text: "old b", line: 11, tone: "del" },
        right: { text: "", tone: "empty" },
      },
    ]);
  });

  it("pads the left side for pure additions", () => {
    const rows = splitRows([
      { kind: "add", text: "one", newLine: 1 },
      { kind: "add", text: "two", newLine: 2 },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["line", "line"]);
    if (rows[0].kind !== "line" || rows[1].kind !== "line") {
      throw new Error("expected line rows");
    }
    expect(rows[0].left.tone).toBe("empty");
    expect(rows[0].right).toEqual({ text: "one", line: 1, tone: "add" });
    expect(rows[1].right).toEqual({ text: "two", line: 2, tone: "add" });
  });

  it("passes gap markers through and flushes pending pairs", () => {
    const rows = splitRows([
      { kind: "del", text: "gone", oldLine: 1 },
      { kind: "gap", count: 20 },
      { kind: "add", text: "fresh", newLine: 30 },
    ]);
    expect(rows).toEqual([
      {
        kind: "line",
        left: { text: "gone", line: 1, tone: "del" },
        right: { text: "", tone: "empty" },
      },
      { kind: "gap", count: 20 },
      {
        kind: "line",
        left: { text: "", tone: "empty" },
        right: { text: "fresh", line: 30, tone: "add" },
      },
    ]);
  });

  it("mirrors a real edit from diffLines", () => {
    const result = diffLines("a\nb\nc\nd\n", "a\nB\nc\nD\n", { context: 3 });
    const rows = splitRows(result.rows);
    const lines = rows.filter(
      (r): r is Extract<(typeof rows)[number], { kind: "line" }> => r.kind === "line",
    );
    // Two changed lines pair old b with new B, old d with new D.
    const dels = lines.filter((r) => r.left.tone === "del");
    expect(dels).toHaveLength(2);
    expect(dels.map((r) => r.right.tone)).toEqual(["add", "add"]);
    const unchanged = lines.filter((r) => r.left.tone === "ctx");
    expect(unchanged.map((r) => r.left.text)).toEqual(["a", "c"]);
  });
});

describe("diff view mode pref", () => {
  it("defaults to unified and accepts only known values", () => {
    expect(loadDiffViewMode(undefined)).toBe("unified");
    expect(loadDiffViewMode("split")).toBe("split");
    expect(loadDiffViewMode("weird")).toBe("unified");
  });

  it("round-trips through localStorage", () => {
    writeDiffViewMode("split");
    expect(readDiffViewMode()).toBe("split");
    writeDiffViewMode("unified");
    expect(readDiffViewMode()).toBe("unified");
  });

  it("reads back what was stored under the public key", () => {
    writeDiffViewMode("split");
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(DIFF_VIEW_KEY)
        : window.localStorage.getItem(DIFF_VIEW_KEY);
    expect(raw).toBe("split");
    writeDiffViewMode("unified");
  });
});
