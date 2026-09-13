import { describe, expect, it } from "vitest";
import { splitCodeSegments } from "./code-segments";

describe("splitCodeSegments", () => {
  it("splits prose and fenced code", () => {
    const segs = splitCodeSegments("before\n\n```ts\nconst a = 1;\n```\n\nafter");
    expect(segs).toEqual([
      { kind: "md", text: "before\n" },
      { kind: "code", lang: "ts", code: "const a = 1;" },
      { kind: "md", text: "\nafter" },
    ]);
  });

  it("uses an empty lang for a bare fence", () => {
    expect(splitCodeSegments("```\nx\n```")).toEqual([
      { kind: "code", lang: "", code: "x" },
    ]);
  });

  it("runs an unclosed fence to the end", () => {
    expect(splitCodeSegments("intro\n```js\nstill typing")).toEqual([
      { kind: "md", text: "intro" },
      { kind: "code", lang: "js", code: "still typing" },
    ]);
  });

  it("needs a longer close for longer open runs", () => {
    const segs = splitCodeSegments("````\n```\ninner\n```\n````\ntail");
    expect(segs).toEqual([
      { kind: "code", lang: "", code: "```\ninner\n```" },
      { kind: "md", text: "tail" },
    ]);
  });

  it("keeps accidental and indented fences inline", () => {
    // An info string that is not a bare language id is prose, not a fence.
    expect(splitCodeSegments("说点什么```不是代码")).toEqual([
      { kind: "md", text: "说点什么```不是代码" },
    ]);
    // Four-space indent is an indented code block to marked, not a fence.
    const segs = splitCodeSegments("para\n\n    ```js\n    x\n    ```");
    expect(segs.every((s) => s.kind === "md")).toBe(true);
  });

  it("matches tildes and keeps the other mark inside", () => {
    expect(splitCodeSegments("~~~\n```\n~~~")).toEqual([
      { kind: "code", lang: "", code: "```" },
    ]);
  });
});
