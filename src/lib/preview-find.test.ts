import { describe, expect, it } from "vitest";
import { findNext, findPrev, previewFind } from "./preview-find";

describe("previewFind", () => {
  it("returns no matches for an empty query", () => {
    expect(previewFind("hello world", "")).toEqual({ query: "", matches: [], index: -1 });
    expect(previewFind("hello world", "   ")).toEqual({ query: "   ", matches: [], index: -1 });
  });

  it("finds all case-insensitive non-overlapping matches", () => {
    expect(previewFind("Foo foo FOO", "foo")).toEqual({
      query: "foo",
      matches: [
        { start: 0, end: 3 },
        { start: 4, end: 7 },
        { start: 8, end: 11 },
      ],
      index: 0,
    });
  });

  it("does not overlap successive hits", () => {
    expect(previewFind("aaa", "aa").matches).toEqual([{ start: 0, end: 2 }]);
  });
});

describe("findNext / findPrev", () => {
  const three = previewFind("ab ab ab", "ab");

  it("advances and wraps", () => {
    expect(findNext(three).index).toBe(1);
    expect(findNext(findNext(findNext(three))).index).toBe(0);
  });

  it("goes backward and wraps", () => {
    expect(findPrev(three).index).toBe(2);
    expect(findPrev(findNext(three)).index).toBe(0);
  });

  it("stays at -1 when there are no matches", () => {
    const empty = previewFind("abc", "z");
    expect(empty.index).toBe(-1);
    expect(findNext(empty).index).toBe(-1);
    expect(findPrev(empty).index).toBe(-1);
  });
});
