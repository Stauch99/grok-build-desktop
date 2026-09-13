import { describe, expect, it } from "vitest";
import {
  addRunningId,
  displayedIsRunning,
  removeRunningId,
  settledSessionIds,
  shouldAbandonInFlightOnSend,
  syncDisplayedBusy,
} from "./running-sessions";

describe("running session set", () => {
  it("adds without duplicating and removes one id at a time", () => {
    expect(addRunningId(["a"], "b")).toEqual(["a", "b"]);
    expect(addRunningId(["a"], "a")).toEqual(["a"]);
    expect(addRunningId([], null)).toEqual([]);
    expect(removeRunningId(["a", "b"], "a")).toEqual(["b"]);
    expect(removeRunningId(["a"], "c")).toEqual(["a"]);
  });

  it("treats the open session as running only when it is in the set", () => {
    expect(displayedIsRunning("b", ["a", "b"])).toBe(true);
    expect(displayedIsRunning("b", ["a"])).toBe(false);
    expect(displayedIsRunning(null, ["a"])).toBe(false);
  });

  it("lists sessions that left the in-flight set", () => {
    expect(settledSessionIds(["a", "b"], ["b"])).toEqual(["a"]);
    expect(settledSessionIds(["a"], ["a"])).toEqual([]);
    expect(settledSessionIds(["a"], [])).toEqual(["a"]);
  });

  it("does not cancel another session's in-flight prompt when sending", () => {
    expect(shouldAbandonInFlightOnSend({ pendingSessionId: "a", sendingSessionId: "b" })).toBe(false);
    expect(shouldAbandonInFlightOnSend({ pendingSessionId: "a", sendingSessionId: "a" })).toBe(true);
    expect(shouldAbandonInFlightOnSend({ pendingSessionId: null, sendingSessionId: "a" })).toBe(false);
  });

  it("idles the open pane only when that session is no longer running", () => {
    expect(syncDisplayedBusy({ displayedId: "b", runningIds: ["a"] })).toBe(false);
    expect(syncDisplayedBusy({ displayedId: "b", runningIds: ["a", "b"] })).toBe(true);
    expect(syncDisplayedBusy({ displayedId: null, runningIds: [], catchUpBusy: true })).toBe(true);
    expect(syncDisplayedBusy({ displayedId: "b", runningIds: [], catchUpBusy: true })).toBe(true);
  });
});
