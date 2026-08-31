import { describe, expect, it } from "vitest";
import {
  NONE_SESSION_KEY,
  draftKey,
  getDraft,
  getSessionRailTab,
  loadDrafts,
  setDraft,
  setSessionRailTab,
} from "./session-drafts";

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

describe("draft key __none__", () => {
  it("maps empty and null session ids to __none__", () => {
    expect(NONE_SESSION_KEY).toBe("__none__");
    expect(draftKey(null)).toBe("__none__");
    expect(draftKey(undefined)).toBe("__none__");
    expect(draftKey("")).toBe("__none__");
    expect(draftKey("__none__")).toBe("__none__");
    expect(draftKey("s1")).toBe("s1");
  });

  it("persists no-session drafts under __none__", () => {
    const next = setDraft({}, "", "composer text");
    expect(next).toEqual({ [NONE_SESSION_KEY]: "composer text" });
    expect(getDraft(next, "")).toBe("composer text");
    expect(getDraft(next, null)).toBe("composer text");
    expect(getDraft(next, NONE_SESSION_KEY)).toBe("composer text");
  });

  it("loads empty-string keys as __none__", () => {
    expect(loadDrafts({ "": "old", s1: "keep" })).toEqual({
      [NONE_SESSION_KEY]: "old",
      s1: "keep",
    });
  });

  it("clears the __none__ draft when text is empty", () => {
    const base = setDraft({}, NONE_SESSION_KEY, "x");
    expect(setDraft(base, "", "")).toEqual({});
  });
});

describe("session rail tab", () => {
  it("records last tab per session without mutating the map", () => {
    const base = {};
    const next = setSessionRailTab(base, "s1", "changes");
    expect(base).toEqual({});
    expect(getSessionRailTab(next, "s1")).toBe("changes");
    expect(getSessionRailTab(next, "missing")).toBeUndefined();
  });
});
