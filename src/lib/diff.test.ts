import { describe, expect, it } from "vitest";
import { collapseContext, diffLines, rowMark, type DiffRow } from "./diff";

const kinds = (rows: DiffRow[]) => rows.map((r) => r.kind);
const texts = (rows: DiffRow[]) =>
  rows.map((r) => (r.kind === "gap" ? `gap:${r.count}` : `${rowMark(r.kind)}${r.text}`));

describe("diffLines — created files", () => {
  it("treats a null oldText as an all-added file", () => {
    const d = diffLines(null, "a\nb");
    expect(kinds(d.rows)).toEqual(["add", "add"]);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
  });

  it("numbers the new lines from one", () => {
    const d = diffLines(null, "a\nb");
    expect(d.rows).toEqual([
      { kind: "add", text: "a", newLine: 1 },
      { kind: "add", text: "b", newLine: 2 },
    ]);
  });

  it("handles an empty new file", () => {
    expect(diffLines(null, "").rows).toEqual([]);
  });
});

describe("diffLines — edits", () => {
  it("marks a single changed line and keeps its neighbours", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    expect(texts(d.rows)).toEqual([" a", "−b", "+B", " c"]);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
  });

  it("reports a pure insertion", () => {
    const d = diffLines("a\nc", "a\nb\nc");
    expect(texts(d.rows)).toEqual([" a", "+b", " c"]);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(0);
  });

  it("reports a pure deletion", () => {
    const d = diffLines("a\nb\nc", "a\nc");
    expect(texts(d.rows)).toEqual([" a", "−b", " c"]);
    expect(d.removed).toBe(1);
  });

  it("keeps old and new line numbers straight around an insertion", () => {
    const d = diffLines("a\nc", "a\nb\nc");
    const ctx = d.rows.filter((r) => r.kind === "ctx");
    expect(ctx[0]).toEqual({ kind: "ctx", text: "a", oldLine: 1, newLine: 1 });
    expect(ctx[1]).toEqual({ kind: "ctx", text: "c", oldLine: 2, newLine: 3 });
  });

  it("has no rows when nothing changed", () => {
    const d = diffLines("a\nb", "a\nb");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
    expect(kinds(d.rows).filter((k) => k !== "gap")).toEqual([]);
  });

  it("ignores a trailing newline difference in line splitting", () => {
    expect(diffLines("a\nb\n", "a\nb").added).toBe(0);
  });
});

describe("diffLines — context collapsing", () => {
  it("hides untouched lines far from any change", () => {
    const old = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");
    const next = old.replace("line15", "CHANGED");
    const d = diffLines(old, next);
    const gaps = d.rows.filter((r) => r.kind === "gap");
    expect(gaps).toHaveLength(2);
    expect(d.rows.filter((r) => r.kind === "ctx")).toHaveLength(6);
  });

  it("keeps exactly the requested context on each side", () => {
    const old = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");
    const next = old.replace("line15", "CHANGED");
    const d = diffLines(old, next, { context: 1 });
    expect(d.rows.filter((r) => r.kind === "ctx")).toHaveLength(2);
  });

  it("counts how many lines each gap hides", () => {
    const rows: DiffRow[] = [
      { kind: "ctx", text: "a", oldLine: 1, newLine: 1 },
      { kind: "ctx", text: "b", oldLine: 2, newLine: 2 },
      { kind: "ctx", text: "c", oldLine: 3, newLine: 3 },
      { kind: "add", text: "d", newLine: 4 },
    ];
    expect(collapseContext(rows, 1)).toEqual([
      { kind: "gap", count: 2 },
      { kind: "ctx", text: "c", oldLine: 3, newLine: 3 },
      { kind: "add", text: "d", newLine: 4 },
    ]);
  });

  it("leaves a short file uncollapsed", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    expect(d.rows.some((r) => r.kind === "gap")).toBe(false);
  });
});

describe("diffLines — limits", () => {
  it("flags truncation and caps the row count", () => {
    const old = Array.from({ length: 500 }, (_, i) => `a${i}`).join("\n");
    const next = Array.from({ length: 500 }, (_, i) => `b${i}`).join("\n");
    const d = diffLines(old, next, { maxRows: 50 });
    expect(d.truncated).toBe(true);
    expect(d.rows).toHaveLength(50);
    expect(d.added).toBe(500);
    expect(d.removed).toBe(500);
  });

  it("still produces a usable diff for a big file with a small edit", () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `line${i}`);
    const old = lines.join("\n");
    const next = lines.map((l, i) => (i === 2000 ? "CHANGED" : l)).join("\n");
    const d = diffLines(old, next);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.truncated).toBe(false);
  });
});

describe("rowMark", () => {
  it("uses a symbol so colour is never the only signal", () => {
    expect(rowMark("add")).toBe("+");
    expect(rowMark("del")).toBe("−");
    expect(rowMark("ctx")).toBe(" ");
  });
});
