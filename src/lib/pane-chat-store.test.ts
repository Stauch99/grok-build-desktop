import { describe, expect, it } from "vitest";
import { emptyChat, type ChatState } from "./chat";
import { chatShellKey, createPaneChatStore, extraPaneShouldRender } from "./pane-chat-store";

function chatWithAssistant(text: string, id = "a1"): ChatState {
  return {
    ...emptyChat(),
    items: [{ kind: "assistant", id, text }],
    nextId: 2,
  };
}

describe("chatShellKey", () => {
  it("stays stable while the same assistant bubble grows", () => {
    const a = chatWithAssistant("Hel");
    const b = chatWithAssistant("Hello world");
    expect(chatShellKey(a)).toBe(chatShellKey(b));
  });

  it("changes when a new item or tool status appears", () => {
    const streaming = chatWithAssistant("hi");
    const nextItem: ChatState = {
      ...streaming,
      items: [...streaming.items, { kind: "user", id: "u1", text: "again" }],
      nextId: 3,
    };
    expect(chatShellKey(streaming)).not.toBe(chatShellKey(nextItem));
    const withTool: ChatState = {
      ...streaming,
      items: [...streaming.items, { kind: "tool", id: "t1", title: "read", status: "pending" }],
      nextId: 3,
    };
    const toolDone: ChatState = {
      ...withTool,
      items: [{ ...withTool.items[0]! }, { kind: "tool", id: "t1", title: "read", status: "completed" }],
    };
    expect(chatShellKey(withTool)).not.toBe(chatShellKey(toolDone));
  });
});

describe("createPaneChatStore", () => {
  it("notifies subscribers on chat writes without requiring React state", () => {
    const store = createPaneChatStore();
    let ticks = 0;
    const stop = store.subscribe(() => {
      ticks += 1;
    });
    store.setMainChat(chatWithAssistant("a"));
    store.setMainChat(chatWithAssistant("ab"));
    expect(store.getMain().chat.items[0]).toMatchObject({ kind: "assistant", text: "ab" });
    expect(ticks).toBe(2);
    stop();
    store.setMainChat(chatWithAssistant("abc"));
    expect(ticks).toBe(2);
  });
});

describe("extraPaneShouldRender", () => {
  it("skips token-only chat updates and lifts busy/session changes", () => {
    const base = {
      sessionId: "s1",
      cwd: "/w",
      draft: "",
      busy: true,
      atBottom: true,
      queue: { items: [], nextId: 1 },
      agentId: "grok",
      chat: chatWithAssistant("Hel"),
    };
    expect(extraPaneShouldRender(base, { ...base, chat: chatWithAssistant("Hello") })).toBe(false);
    expect(extraPaneShouldRender(base, { ...base, busy: false })).toBe(true);
  });
});
