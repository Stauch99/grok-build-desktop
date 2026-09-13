import { describe, expect, it } from "vitest";
import { emptyChat, type ChatItem, type ChatState } from "./chat";
import { STALL_HARD_MS } from "./stall";
import {
  GHOST_STREAMING_GRACE_MS,
  PROMPT_RPC_TIMEOUT_MS,
  applyGhostHeal,
  findOptimisticGhostTurn,
  shouldHealGhostStreaming,
  shouldOfferWedgedRetry,
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
    sendInFlight: true,
    turnStartedAt: 0,
    nowMs: GHOST_STREAMING_GRACE_MS,
    items: [user("u1", "hello")],
  };

  it("heals only while session/prompt has not left the client", () => {
    expect(shouldHealGhostStreaming(base)).toBe(true);
  });

  it("does not cancel a live thinking turn after the prompt was written", () => {
    expect(shouldHealGhostStreaming({ ...base, sendInFlight: false })).toBe(false);
  });

  it("does not heal before grace, when idle, or while a permission card is up", () => {
    expect(shouldHealGhostStreaming({ ...base, nowMs: GHOST_STREAMING_GRACE_MS - 1 })).toBe(false);
    expect(shouldHealGhostStreaming({ ...base, busy: false })).toBe(false);
    expect(shouldHealGhostStreaming({ ...base, pendingPermission: true })).toBe(false);
  });
});

describe("shouldOfferWedgedRetry", () => {
  const base = {
    busy: true,
    pendingPermission: false,
    sendInFlight: false,
    lastActivityAt: 0,
    nowMs: STALL_HARD_MS,
  };

  it("offers stop-and-retry after the prompt was written and the turn is stuck", () => {
    expect(shouldOfferWedgedRetry(base)).toBe(true);
  });

  it("does not auto-offer while session/prompt is still in flight (ghost heal owns that)", () => {
    expect(shouldOfferWedgedRetry({ ...base, sendInFlight: true })).toBe(false);
  });

  it("does not offer before stall=stuck, when idle, or while a permission card is up", () => {
    expect(shouldOfferWedgedRetry({ ...base, nowMs: STALL_HARD_MS - 1 })).toBe(false);
    expect(shouldOfferWedgedRetry({ ...base, busy: false })).toBe(false);
    expect(shouldOfferWedgedRetry({ ...base, pendingPermission: true })).toBe(false);
  });

  it("keeps prompt RPC timeout long enough not to abort a healthy turn", () => {
    expect(PROMPT_RPC_TIMEOUT_MS).toBe(10 * 60_000);
    expect(PROMPT_RPC_TIMEOUT_MS).toBeGreaterThan(STALL_HARD_MS);
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
