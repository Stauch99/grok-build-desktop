import { describe, expect, it } from "vitest";
import { emptyChat, type ChatItem, type ChatState } from "./chat";
import {
  GHOST_STREAMING_GRACE_MS,
  applyGhostHeal,
  findOptimisticGhostTurn,
  shouldHealGhostStreaming,
  stampMainTurnClock,
} from "./ghost-streaming-heal";

function user(id: string, text: string): ChatItem {
  return { kind: "user", id, text, at: 1 };
}

function assistant(id: string, text: string): ChatItem {
  return { kind: "assistant", id, text, at: 2 };
}

function tool(id: string): ChatItem {
  return { kind: "tool", id, title: "bash", status: "in_progress", at: 2 };
}

describe("findOptimisticGhostTurn", () => {
  it("returns the trailing echoed user when nothing followed", () => {
    const turn = findOptimisticGhostTurn([user("u1", "hi"), user("u2", "fix the stall")]);
    expect(turn).toEqual({
      dropIds: ["u2"],
      restoreComposerText: "fix the stall",
    });
  });

  it("returns null once an assistant or tool has started", () => {
    expect(findOptimisticGhostTurn([user("u1", "hi"), assistant("a1", "ok")])).toBeNull();
    expect(findOptimisticGhostTurn([user("u1", "hi"), tool("t1")])).toBeNull();
  });
});

describe("shouldHealGhostStreaming", () => {
  const base = {
    busy: true,
    pendingPermission: false,
    sendInFlight: false,
    turnStartedAt: 0,
    nowMs: GHOST_STREAMING_GRACE_MS,
    items: [user("u1", "hello")],
  };

  it("heals a busy echoed user after the grace window when send is not in flight", () => {
    expect(shouldHealGhostStreaming(base)).toBe(true);
  });

  it("does not heal during in-flight IPC or before grace", () => {
    expect(shouldHealGhostStreaming({ ...base, sendInFlight: true })).toBe(false);
    expect(shouldHealGhostStreaming({ ...base, nowMs: GHOST_STREAMING_GRACE_MS - 1 })).toBe(false);
    expect(shouldHealGhostStreaming({ ...base, busy: false })).toBe(false);
    expect(shouldHealGhostStreaming({ ...base, pendingPermission: true })).toBe(false);
  });
});

describe("stampMainTurnClock", () => {
  it("stamps when main becomes busy and clears when main goes idle", () => {
    expect(stampMainTurnClock(true, null, 100)).toBe(100);
    expect(stampMainTurnClock(true, 100, 999)).toBe(100);
    expect(stampMainTurnClock(false, 100, 999)).toBeNull();
  });
});

describe("applyGhostHeal", () => {
  it("drops the echoed user and restores composer text", () => {
    const chat: ChatState = {
      ...emptyChat(),
      items: [user("u0", "earlier"), user("u1", "retry me")],
      nextId: 3,
    };
    const turn = findOptimisticGhostTurn(chat.items);
    expect(turn).not.toBeNull();
    const next = applyGhostHeal(chat, turn!);
    expect(next.items.map((i) => i.id)).toEqual(["u0"]);
    expect(next.nextId).toBe(3);
  });
});
