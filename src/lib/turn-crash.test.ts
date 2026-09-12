import { describe, expect, it } from "vitest";
import { emptyChat, type ChatItem, type ChatState } from "./chat";
import { applyTurnCrash, turnLeaseAfterCrash, type TurnLease } from "./turn-crash";

function user(id: string, text: string): ChatItem {
  return { kind: "user", id, text, at: 1 };
}

function tool(id: string, status: "in_progress" | "completed" | "failed"): ChatItem {
  return { kind: "tool", id, title: "bash", status, at: 2 };
}

function chat(items: ChatItem[]): ChatState {
  return { ...emptyChat(), items, nextId: items.length + 1 };
}

describe("applyTurnCrash", () => {
  it("cancels open tools and appends a crash notice when the turn was live", () => {
    const next = applyTurnCrash(chat([user("u1", "run it"), tool("t1", "in_progress"), tool("t2", "completed")]), {
      busy: true,
      detail: "Grok 已退出",
      at: 9,
    });
    expect(next.items.find((i) => i.id === "t1")).toMatchObject({ status: "cancelled" });
    expect(next.items.find((i) => i.id === "t2")).toMatchObject({ status: "completed" });
    const fail = next.items[next.items.length - 1];
    expect(fail).toMatchObject({ kind: "tool", status: "failed", detail: "Grok 已退出" });
  });

  it("leaves an idle transcript unchanged", () => {
    const prev = chat([user("u1", "hi"), tool("t1", "completed")]);
    expect(applyTurnCrash(prev, { busy: false, detail: "Grok 已退出", at: 9 })).toEqual(prev);
  });

  it("still heals open tools after busy has already cleared", () => {
    const prev = chat([user("u1", "run it"), tool("t1", "in_progress")]);
    const next = applyTurnCrash(prev, { busy: false, detail: "Grok 已退出", at: 9 });
    expect(next.items[1]).toMatchObject({ id: "t1", status: "cancelled" });
    expect(next.items.at(-1)).toMatchObject({ status: "failed", detail: "Grok 已退出" });
  });
});

describe("turnLeaseAfterCrash", () => {
  it("marks an active lease interrupted", () => {
    const lease: TurnLease = {
      sessionId: "s1",
      status: "active",
      startedAt: 1,
      updatedAt: 1,
    };
    expect(turnLeaseAfterCrash(lease, 9)).toEqual({
      sessionId: "s1",
      status: "interrupted",
      startedAt: 1,
      updatedAt: 9,
    });
    expect(turnLeaseAfterCrash(null, 9)).toBeNull();
  });
});
