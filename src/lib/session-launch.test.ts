import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_FOCUSED_SESSION_KEY,
  loadLastSessionId,
  reopenLastSessionEnabled,
  saveLastSessionId,
  setReopenLastSessionEnabled,
} from "./session-launch";

beforeEach(() => {
  window.localStorage.clear();
});

describe("reopen-last-session flag", () => {
  it("defaults off and round-trips", () => {
    expect(reopenLastSessionEnabled()).toBe(false);
    setReopenLastSessionEnabled(true);
    expect(reopenLastSessionEnabled()).toBe(true);
    setReopenLastSessionEnabled(false);
    expect(reopenLastSessionEnabled()).toBe(false);
  });
});

describe("last focused session id", () => {
  it("persists non-empty ids and never stores empty", () => {
    expect(loadLastSessionId()).toBe("");
    saveLastSessionId(null);
    saveLastSessionId("");
    expect(loadLastSessionId()).toBe("");
    saveLastSessionId("s1");
    expect(loadLastSessionId()).toBe("s1");
    saveLastSessionId(null);
    expect(loadLastSessionId()).toBe("s1");
    expect(window.localStorage.getItem(LAST_FOCUSED_SESSION_KEY)).toBe("s1");
  });
});
