import { describe, expect, it } from "vitest";
import { highlight, highlightLang, tokensToLines } from "./highlight";

describe("highlightLang", () => {
  it("maps preview languages from the path", () => {
    expect(highlightLang("src/a.ts")).toBe("ts");
    expect(highlightLang("src/a.tsx")).toBe("tsx");
    expect(highlightLang("src/a.js")).toBe("js");
    expect(highlightLang("src/a.jsx")).toBe("jsx");
    expect(highlightLang("src/a.py")).toBe("py");
    expect(highlightLang("src/a.rs")).toBe("rs");
    expect(highlightLang("src/a.json")).toBe("json");
    expect(highlightLang("notes.md")).toBe("md");
  });

  it("is null for unsupported files", () => {
    expect(highlightLang("src/a.css")).toBeNull();
    expect(highlightLang("Makefile")).toBeNull();
  });
});

describe("highlight", () => {
  it("tokenizes js keywords, strings, and comments", () => {
    expect(highlight('const x = "hi"; // c', "js")).toEqual([
      { text: "const", kind: "kw" },
      { text: " x = ", kind: "plain" },
      { text: '"hi"', kind: "str" },
      { text: "; ", kind: "plain" },
      { text: "// c", kind: "cmt" },
    ]);
  });

  it("does not treat keywords inside strings as keywords", () => {
    expect(highlight('"function"', "ts")).toEqual([{ text: '"function"', kind: "str" }]);
  });

  it("tokenizes ts type keywords", () => {
    expect(highlight("type X = string", "ts")).toEqual([
      { text: "type", kind: "kw" },
      { text: " X = ", kind: "plain" },
      { text: "string", kind: "kw" },
    ]);
  });

  it("tokenizes python def, hash comments, and strings", () => {
    expect(highlight("def foo():\n    # hi\n    return 'x'", "py")).toEqual([
      { text: "def", kind: "kw" },
      { text: " foo():\n    ", kind: "plain" },
      { text: "# hi", kind: "cmt" },
      { text: "\n    ", kind: "plain" },
      { text: "return", kind: "kw" },
      { text: " ", kind: "plain" },
      { text: "'x'", kind: "str" },
    ]);
  });

  it("tokenizes rust fn, let, strings, and comments", () => {
    expect(highlight('fn main() { let x = "a"; // c }', "rs")).toEqual([
      { text: "fn", kind: "kw" },
      { text: " main() { ", kind: "plain" },
      { text: "let", kind: "kw" },
      { text: " x = ", kind: "plain" },
      { text: '"a"', kind: "str" },
      { text: "; ", kind: "plain" },
      { text: "// c }", kind: "cmt" },
    ]);
  });

  it("tokenizes json strings and literals", () => {
    expect(highlight('{"a": true}', "json")).toEqual([
      { text: "{", kind: "plain" },
      { text: '"a"', kind: "str" },
      { text: ": ", kind: "plain" },
      { text: "true", kind: "kw" },
      { text: "}", kind: "plain" },
    ]);
  });

  it("tokenizes markdown headings and inline code", () => {
    expect(highlight("# Hi\n\na `b` c", "md")).toEqual([
      { text: "# Hi", kind: "kw" },
      { text: "\n\na ", kind: "plain" },
      { text: "`b`", kind: "str" },
      { text: " c", kind: "plain" },
    ]);
  });

  it("keeps block comments as comment tokens", () => {
    expect(highlight("a /* x */ b", "jsx")).toEqual([
      { text: "a ", kind: "plain" },
      { text: "/* x */", kind: "cmt" },
      { text: " b", kind: "plain" },
    ]);
  });
});

describe("tokensToLines", () => {
  it("splits tokens so each line matches split('\\n')", () => {
    const lines = tokensToLines([
      { text: "const", kind: "kw" },
      { text: " x\ny", kind: "plain" },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([
      { text: "const", kind: "kw" },
      { text: " x", kind: "plain" },
    ]);
    expect(lines[1]).toEqual([{ text: "y", kind: "plain" }]);
  });
});
