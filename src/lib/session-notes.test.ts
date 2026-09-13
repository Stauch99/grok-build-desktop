import { beforeEach, describe, expect, it } from "vitest";
import {
  NOTE_MAX_CHARS,
  NOTES_MAX_ENTRIES,
  SESSION_NOTES_KEY,
  getSessionNote,
  loadSessionNotes,
  setSessionNote,
} from "./session-notes";

beforeEach(() => {
  window.localStorage.clear();
});

describe("loadSessionNotes", () => {
  it("keeps string values, drops junk, caps length", () => {
    const out = loadSessionNotes({
      a: "note",
      b: "",
      c: 3,
      d: "x".repeat(NOTE_MAX_CHARS + 10),
    });
    expect(out.a).toBe("note");
    expect(out.b).toBeUndefined();
    expect(out.c).toBeUndefined();
    expect(out.d).toHaveLength(NOTE_MAX_CHARS);
    expect(loadSessionNotes(null)).toEqual({});
    expect(loadSessionNotes(["a"])).toEqual({});
  });
});

describe("session notes", () => {
  it("round-trips through localStorage", () => {
    expect(getSessionNote("s1")).toBe("");
    setSessionNote("s1", "remember this");
    expect(getSessionNote("s1")).toBe("remember this");
    setSessionNote("s1", "");
    expect(getSessionNote("s1")).toBe("");
  });

  it("caps a note at NOTE_MAX_CHARS", () => {
    const long = "y".repeat(NOTE_MAX_CHARS + 50);
    expect(setSessionNote("s1", long)).toHaveLength(NOTE_MAX_CHARS);
    expect(getSessionNote("s1")).toHaveLength(NOTE_MAX_CHARS);
  });

  it("evicts least-recently-used entries past the cap", () => {
    for (let i = 0; i < NOTES_MAX_ENTRIES; i++) setSessionNote(`s${i}`, `n${i}`);
    // Touch s0 so s1 becomes the oldest entry.
    setSessionNote("s0", getSessionNote("s0"));
    setSessionNote("fresh", "n");
    expect(getSessionNote("s0")).toBe("n0");
    expect(getSessionNote("s1")).toBe("");
    expect(getSessionNote("fresh")).toBe("n");
    const stored = JSON.parse(window.localStorage.getItem(SESSION_NOTES_KEY) ?? "{}");
    expect(Object.keys(stored)).toHaveLength(NOTES_MAX_ENTRIES);
  });
});
