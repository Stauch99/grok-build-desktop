import { describe, expect, it } from "vitest";
import {
  bindTurnSession,
  emptyTurnStore,
  endCatchUpTurn,
  endTurn,
  endTurnsForAgent,
  markTurnCancelling,
  paneTurnIsLive,
  primaryRunningId,
  runningSessionIds,
  shouldAbandonTurnOnSend,
  shouldDropLiveUpdate,
  startTurn,
} from "./acp-turn";

describe("acp turn store", () => {
  it("keeps a background session live while the open pane is idle", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 1 });
    expect(paneTurnIsLive(store, { pane: "main", sessionId: "a" })).toBe(true);
    expect(paneTurnIsLive(store, { pane: "main", sessionId: "b" })).toBe(false);
    expect(runningSessionIds(store)).toEqual(["a"]);
    expect(primaryRunningId(store, "b")).toBe("a");
    expect(primaryRunningId(store, "a")).toBe("a");
  });

  it("binds catch-up sending to the session id once session/new returns", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: null, pane: "main", generation: 1 });
    expect(paneTurnIsLive(store, { pane: "main", sessionId: null })).toBe(true);
    store = bindTurnSession(store, "main", "s1");
    expect(runningSessionIds(store)).toEqual(["s1"]);
    expect(paneTurnIsLive(store, { pane: "main", sessionId: "s1" })).toBe(true);
  });

  it("can run two sessions without cancelling the other on send", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 1 });
    store = startTurn(store, { sessionId: "b", pane: "split", generation: 2 });
    expect(runningSessionIds(store)).toEqual(["a", "b"]);
    expect(shouldAbandonTurnOnSend({ pendingSessionId: "a", sendingSessionId: "b" })).toBe(false);
    expect(shouldAbandonTurnOnSend({ pendingSessionId: "a", sendingSessionId: "a" })).toBe(true);
    store = endTurn(store, { sessionId: "a" });
    expect(runningSessionIds(store)).toEqual(["b"]);
  });

  it("does not end a newer generation", () => {
    const store = startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 2 });
    expect(endTurn(store, { sessionId: "a", generation: 1 }).turns).toHaveLength(1);
    expect(endTurn(store, { sessionId: "a", generation: 2 }).turns).toHaveLength(0);
  });

  it("ends only that CLI's leases on process death", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 1, agentId: "grok" });
    store = startTurn(store, { sessionId: "b", pane: "split", generation: 2, agentId: "kimi" });
    store = endTurnsForAgent(store, "grok");
    expect(runningSessionIds(store)).toEqual(["b"]);
  });

  it("clears catch-up without ending a background session on the same pane", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 1, agentId: "grok" });
    store = startTurn(store, { sessionId: null, pane: "main", generation: 2, agentId: "kimi" });
    store = endCatchUpTurn(store, "main");
    expect(runningSessionIds(store)).toEqual(["a"]);
    expect(paneTurnIsLive(store, { pane: "main", sessionId: null })).toBe(false);
  });

  it("does not busy a different session while catch-up is in flight", () => {
    let store = startTurn(emptyTurnStore(), { sessionId: null, pane: "main", generation: 1 });
    expect(paneTurnIsLive(store, { pane: "main", sessionId: "open" })).toBe(false);
    expect(paneTurnIsLive(store, { pane: "main", sessionId: null })).toBe(true);
  });

  it("marks cancelling without dropping the lease", () => {
    const store = markTurnCancelling(
      startTurn(emptyTurnStore(), { sessionId: "a", pane: "main", generation: 1 }),
      { sessionId: "a" },
    );
    expect(store.turns[0]?.status).toBe("cancelling");
    expect(paneTurnIsLive(store, { pane: "main", sessionId: "a" })).toBe(true);
  });
});

describe("shouldDropLiveUpdate", () => {
  it("still closes a lease when the open pane is elsewhere or resuming", () => {
    expect(shouldDropLiveUpdate({ dest: "drop", ignoreReplay: false, terminal: true })).toBe("terminal");
    expect(shouldDropLiveUpdate({ dest: "drop", ignoreReplay: false, terminal: false })).toBe("ignore");
    expect(shouldDropLiveUpdate({ dest: "main", ignoreReplay: true, terminal: true })).toBe("terminal");
    expect(shouldDropLiveUpdate({ dest: "main", ignoreReplay: true, terminal: false })).toBe("ignore");
    expect(shouldDropLiveUpdate({ dest: "main", ignoreReplay: false, terminal: false })).toBe("apply");
  });
});
