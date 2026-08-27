import { describe, expect, it } from "vitest";
import { getDraft, loadDrafts, setDraft } from "./session-drafts";

describe("loadDrafts", () => {
  it("returns empty map for missing input", () => {
    expect(loadDrafts()).toEqual({});
    expect(loadDrafts(undefined)).toEqual({});
  });

  it("copies string entries and drops empty", () => {
    expect(loadDrafts({ a: "hi", b: "" })).toEqual({ a: "hi" });
  });

  it("caps long drafts at 20_000", () => {
    const long = "x".repeat(25_000);
    const loaded = loadDrafts({ s: long });
    expect(loaded.s).toHaveLength(20_000);
  });
});

describe("setDraft", () => {
  it("stores text for a session", () => {
    const next = setDraft({}, "s1", "hello");
    expect(getDraft(next, "s1")).toBe("hello");
  });

  it("caps text at 20_000 characters", () => {
    const long = "y".repeat(25_000);
    const next = setDraft({}, "s1", long);
    expect(next.s1).toHaveLength(20_000);
    expect(next.s1).toBe("y".repeat(20_000));
  });

  it("deletes key when text is empty", () => {
    const base = setDraft({}, "s1", "keep me");
    const cleared = setDraft(base, "s1", "");
    expect(cleared).not.toHaveProperty("s1");
    expect(getDraft(cleared, "s1")).toBe("");
  });

  it("deletes key when text is only trimmed-away empty after cap path", () => {
    const base = { s1: "x", s2: "y" };
    expect(setDraft(base, "s2", "")).toEqual({ s1: "x" });
  });

  it("does not mutate the input map", () => {
    const base = { s1: "a" };
    const next = setDraft(base, "s1", "b");
    expect(base.s1).toBe("a");
    expect(next.s1).toBe("b");
  });
});

describe("getDraft", () => {
  it("returns empty string for missing session", () => {
    expect(getDraft({}, "missing")).toBe("");
  });
});
