import { beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_MUTE_KEY,
  isSessionMuted,
  loadMutedIds,
  mutedIds,
  onSessionMuteChange,
  saveMutedIds,
  setSessionMuted,
  toggleSessionMuted,
} from "./session-mute";

beforeEach(() => {
  window.localStorage.clear();
});

describe("loadMutedIds", () => {
  it("tolerates junk and empty input", () => {
    expect(loadMutedIds(null).size).toBe(0);
    expect(loadMutedIds("nope").size).toBe(0);
    expect(loadMutedIds({}).size).toBe(0);
    expect([...loadMutedIds(["a", "", 3, "b"])]).toEqual(["a", "b"]);
  });
});

describe("session mute", () => {
  it("starts unmuted and toggles on and off", () => {
    expect(isSessionMuted("s1")).toBe(false);
    expect(toggleSessionMuted("s1")).toBe(true);
    expect(isSessionMuted("s1")).toBe(true);
    expect(toggleSessionMuted("s1")).toBe(false);
    expect(isSessionMuted("s1")).toBe(false);
  });

  it("persists the set as a JSON array", () => {
    setSessionMuted("s1", true);
    setSessionMuted("s2", true);
    expect(JSON.parse(window.localStorage.getItem(SESSION_MUTE_KEY) ?? "[]")).toEqual([
      "s1",
      "s2",
    ]);
    expect(mutedIds().has("s2")).toBe(true);
    setSessionMuted("s1", false);
    expect(isSessionMuted("s1")).toBe(false);
    expect(isSessionMuted("s2")).toBe(true);
  });

  it("never mutes empty or null ids", () => {
    expect(isSessionMuted("")).toBe(false);
    expect(isSessionMuted(null)).toBe(false);
    expect(isSessionMuted(undefined)).toBe(false);
  });

  it("notifies listeners on save", () => {
    let calls = 0;
    const off = onSessionMuteChange(() => {
      calls += 1;
    });
    saveMutedIds(["s1"]);
    expect(calls).toBe(1);
    off();
    saveMutedIds([]);
    expect(calls).toBe(1);
  });

  it("survives a corrupted payload", () => {
    window.localStorage.setItem(SESSION_MUTE_KEY, "{oops");
    expect(isSessionMuted("s1")).toBe(false);
  });
});
