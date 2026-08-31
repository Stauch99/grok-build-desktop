import { describe, expect, it } from "vitest";
import {
  afterByteFor,
  applyChatUpdate,
  applySessionPage,
  emptyChat,
  groupWorkRuns,
  hydrateFromUpdates,
  shouldKeepSessionUpdate,
  toolLabel,
  usagePercent,
  formatElapsed,
  liveWorkStatus,
  shouldClearBusyOnSettledChat,
  assistantCopyReady,
  workRunLabel,
  workRunMeta,
  trailingWorkStartedAt,
} from "./chat";

function upd(sessionUpdate: string, extra: Record<string, unknown> = {}) {
  return { update: { sessionUpdate, ...extra } };
}

describe("shouldKeepSessionUpdate", () => {
  it("drops updates for another session when one is selected", () => {
    expect(shouldKeepSessionUpdate("aaa", "bbb")).toBe(false);
  });
  it("drops sid-scoped updates when the composer is unbound", () => {
    expect(shouldKeepSessionUpdate(null, "bbb")).toBe(false);
  });
  it("keeps matching session", () => {
    expect(shouldKeepSessionUpdate("aaa", "aaa")).toBe(true);
  });
});

describe("applyChatUpdate", () => {
  it("merges consecutive assistant chunks", () => {
    let s = emptyChat();
    s = applyChatUpdate(s, upd("agent_message_chunk", { content: { text: "Hello" } }));
    s = applyChatUpdate(s, upd("agent_message_chunk", { content: { text: " world" } }));
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "Hello world" });
  });

  it("skips user chunks when locally echoed", () => {
    let s = emptyChat();
    s = {
      ...s,
      items: [{ kind: "user", id: "u-1", text: "hi" }],
    };
    s = applyChatUpdate(s, upd("user_message_chunk", { content: { text: "hi" } }), {
      skipUser: true,
    });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ text: "hi" });
  });

  it("upserts tool calls by id", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("tool_call", { toolCallId: "c1", title: "Read", kind: "read", status: "pending" }),
    );
    s = applyChatUpdate(
      s,
      upd("tool_call_update", { toolCallId: "c1", status: "completed", title: "Read file" }),
    );
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "tool", id: "c1", status: "completed", title: "Read file" });
  });

  it("applies usage_update even without a context window size", () => {
    let s = emptyChat();
    s = applyChatUpdate(s, upd("usage_update", { input: 10, output: 4 }));
    expect(s.usage).toMatchObject({ input: 10, output: 4, used: 14 });
  });

  it("does not drop streamed text on turn_completed usage", () => {
    let s = emptyChat();
    s = applyChatUpdate(s, upd("agent_message_chunk", { content: { text: "Hello" } }));
    s = applyChatUpdate(s, upd("agent_message_chunk", { content: { text: " world" } }));
    s = applyChatUpdate(
      s,
      upd("turn_completed", {
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      }),
    );
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "Hello world" });
  });

  it("builds a readable tool label from rawInput", () => {
    expect(toolLabel({ title: "read_file", rawInput: { target_file: "/a.ts" } })).toBe("read_file");
    expect(toolLabel({ kind: "read", rawInput: { path: "/a.ts" } })).toBe("read /a.ts");
    expect(toolLabel({})).toBe("工具调用");
  });

  it("stores plan on chat state for the right rail", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("plan", {
        entries: [
          { content: "写设置页", status: "completed" },
          { content: "接待办", status: "in_progress" },
        ],
      }),
    );
    expect(s.plan).toHaveLength(2);
    expect(s.plan[1].status).toBe("in_progress");
    expect(s.items.filter((i) => i.kind === "plan")).toHaveLength(0);
  });

  it("captures diffs", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("tool_call", {
        toolCallId: "e1",
        kind: "edit",
        content: [{ type: "diff", path: "/a.ts", oldText: "a", newText: "b" }],
      }),
    );
    expect(s.items[0]).toMatchObject({
      kind: "tool",
      diff: { path: "/a.ts", oldText: "a", newText: "b" },
    });
  });

  it("stamps _ts onto new items and until on later chunks", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      { ...upd("agent_message_chunk", { content: { text: "Hello" } }), _ts: 1000 },
    );
    s = applyChatUpdate(
      s,
      { ...upd("agent_message_chunk", { content: { text: " world" } }), _ts: 1500 },
    );
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "Hello world", at: 1000, until: 1500 });
  });

  it("reads modelId and promptIndex from user _meta", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("user_message_chunk", {
        content: { text: "调研" },
        _meta: { modelId: "grok-4", promptIndex: 2 },
      }),
      { now: 42 },
    );
    expect(s.items[0]).toMatchObject({
      kind: "user",
      text: "调研",
      model: "grok-4",
      turn: 2,
      at: 42,
      until: 42,
    });
  });
});

describe("hydrateFromUpdates", () => {
  it("replays a disk log into chat items", () => {
    const rows = [
      {
        method: "session/update",
        params: upd("user_message_chunk", { content: { text: "调研一下" } }),
      },
      {
        method: "session/update",
        params: upd("agent_message_chunk", { content: { text: "好的" } }),
      },
      {
        method: "session/update",
        params: upd("tool_call", { toolCallId: "t1", title: "Read", kind: "read", status: "completed" }),
      },
    ];
    const s = hydrateFromUpdates(rows);
    expect(s.items.map((i) => i.kind)).toEqual(["user", "assistant", "tool"]);
    expect(s.items[0]).toMatchObject({ text: "调研一下" });
  });

  it("accepts params-only rows", () => {
    const s = hydrateFromUpdates([
      upd("agent_message_chunk", { content: { text: "x" } }),
    ]);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "x" });
  });

  it("continues from prev.nextId when rows are a suffix", () => {
    const first = hydrateFromUpdates([
      upd("user_message_chunk", { content: { text: "hi" } }),
    ]);
    expect(first.nextId).toBeGreaterThan(1);
    const next = hydrateFromUpdates(
      [upd("agent_message_chunk", { content: { text: "yo" } })],
      first,
    );
    expect(next.items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    expect(next.items[0]).toMatchObject({ text: "hi" });
    expect(next.items[1]).toMatchObject({ text: "yo" });
    expect(next.nextId).toBeGreaterThan(first.nextId);
    expect(next.items[1].id).not.toBe(first.items[0].id);
  });
});

describe("session update cursor", () => {
  it("keeps nextByte per session and hydrates a suffix onto the cached chat", () => {
    const cursors = new Map();
    expect(afterByteFor(cursors, "s1")).toBeUndefined();
    const first = applySessionPage(cursors, "s1", {
      rows: [upd("user_message_chunk", { content: { text: "hi" } })],
      nextByte: 40,
      truncated: false,
    });
    expect(afterByteFor(cursors, "s1")).toBe(40);
    expect(first.items).toHaveLength(1);
    const second = applySessionPage(cursors, "s1", {
      rows: [upd("agent_message_chunk", { content: { text: "yo" } })],
      nextByte: 80,
      truncated: false,
    });
    expect(afterByteFor(cursors, "s2")).toBeUndefined();
    expect(afterByteFor(cursors, "s1")).toBe(80);
    expect(second.items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });
});

describe("groupWorkRuns", () => {
  it("merges consecutive thought/tool into one block", () => {
    const blocks = groupWorkRuns([
      { kind: "user", id: "u", text: "go" },
      { kind: "thought", id: "t1", text: "hmm" },
      { kind: "tool", id: "k1", title: "read", status: "completed" },
      { kind: "thought", id: "t2", text: "ok" },
      { kind: "assistant", id: "a", text: "done" },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["item", "work", "item"]);
    expect(blocks[1].kind === "work" && blocks[1].items).toHaveLength(3);
  });

  it("labels a work run without exceeding body contrast needs", () => {
    const items = [
      { kind: "thought" as const, id: "t1", text: "hmm" },
      { kind: "tool" as const, id: "k1", title: "read", status: "completed" as const },
    ];
    expect(workRunLabel(items)).toBe("1 段思考 · 1 次调用");
    expect(workRunMeta(items)).toBe("completed");
  });
});

describe("usagePercent", () => {
  it("reads compact started as window fill", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("auto_compact_started", { tokens_used: 400000, context_window: 500000, percentage: 80 }),
    );
    expect(s.usage).toEqual({ used: 400000, size: 500000 });
    expect(usagePercent(s.usage)).toBe(80);
  });

  it("keeps window size after compact completes", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("auto_compact_started", { tokens_used: 400000, context_window: 500000 }),
    );
    s = applyChatUpdate(s, upd("auto_compact_completed", { tokens_after: 31000 }));
    expect(s.usage).toEqual({ used: 31000, size: 500000 });
    expect(usagePercent(s.usage)).toBe(6);
  });

  it("inserts a compact event card when auto-compact runs", () => {
    let s = emptyChat();
    s = applyChatUpdate(
      s,
      upd("auto_compact_started", { tokens_used: 400000, context_window: 500000 }),
    );
    expect(s.items.some((it) => it.kind === "compact" && it.phase === "started")).toBe(true);
    s = applyChatUpdate(s, upd("auto_compact_completed", { tokens_after: 31000 }));
    const last = s.items[s.items.length - 1];
    expect(last).toMatchObject({ kind: "compact", phase: "completed", used: 31000 });
  });

  it("returns null without a window size", () => {
    expect(usagePercent(undefined)).toBeNull();
    expect(usagePercent({ used: 12 })).toBeNull();
  });
});

describe("liveWorkStatus", () => {
  it("prefers an in-flight tool title", () => {
    expect(
      liveWorkStatus([
        { kind: "user", id: "u", text: "go" },
        { kind: "thought", id: "t", text: "hmm" },
        { kind: "tool", id: "k", title: "read App.tsx", status: "in_progress" },
      ]),
    ).toBe("read App.tsx");
  });

  it("falls back to thinking then working", () => {
    expect(liveWorkStatus([{ kind: "thought", id: "t", text: "…" }])).toBe("思考中");
    expect(liveWorkStatus([{ kind: "user", id: "u", text: "hi" }])).toBe("工作中");
  });
});

describe("trailingWorkStartedAt", () => {
  it("uses the earliest at after the last user turn", () => {
    expect(
      trailingWorkStartedAt([
        { kind: "user", id: "u", text: "go", at: 1 },
        { kind: "thought", id: "t", text: "hmm", at: 10 },
        { kind: "tool", id: "k", title: "read", status: "in_progress", at: 40 },
      ]),
    ).toBe(10);
  });

  it("counts a streaming assistant after the user", () => {
    expect(
      trailingWorkStartedAt([
        { kind: "user", id: "u", text: "go", at: 1 },
        { kind: "assistant", id: "a", text: "…", at: 8 },
      ]),
    ).toBe(8);
  });

  it("is undefined when the trailing items have no clock", () => {
    expect(trailingWorkStartedAt([{ kind: "tool", id: "k", title: "read", status: "pending" }])).toBeUndefined();
  });

  it("uses the user send time while waiting for the first work item", () => {
    expect(trailingWorkStartedAt([{ kind: "user", id: "u", text: "hi", at: 1 }])).toBe(1);
  });
});

describe("assistantCopyReady", () => {
  const items = [
    { kind: "user" as const, id: "u1", text: "hi" },
    { kind: "assistant" as const, id: "a1", text: "old" },
    { kind: "user" as const, id: "u2", text: "again" },
    { kind: "assistant" as const, id: "a2", text: "live" },
    { kind: "tool" as const, id: "t1", title: "Read", status: "in_progress" as const },
  ];

  it("shows copy when the session is idle", () => {
    expect(assistantCopyReady(items, "a2", false)).toBe(true);
    expect(assistantCopyReady(items, "a1", false)).toBe(true);
  });

  it("hides copy on the in-flight turn while busy", () => {
    expect(assistantCopyReady(items, "a2", true)).toBe(false);
  });

  it("keeps copy on finished turns while a later turn is busy", () => {
    expect(assistantCopyReady(items, "a1", true)).toBe(true);
  });

  it("hides copy when the item is missing during a live turn", () => {
    expect(assistantCopyReady(items, "missing", true)).toBe(false);
  });
});

describe("shouldClearBusyOnSettledChat", () => {
  const items = [
    { kind: "user" as const, id: "u", text: "ping", at: 1 },
    { kind: "assistant" as const, id: "a", text: "pong", at: 2, until: 3 },
  ];

  it("clears after the reply has been quiet and no tool is in flight", () => {
    expect(shouldClearBusyOnSettledChat({ busy: true, now: 3 + 4000, items })).toBe(true);
    expect(shouldClearBusyOnSettledChat({ busy: true, now: 3 + 3999, items })).toBe(false);
    expect(shouldClearBusyOnSettledChat({ busy: false, now: 3 + 4000, items })).toBe(false);
  });

  it("waits while a tool is still running", () => {
    const live = [...items, { kind: "tool" as const, id: "t", title: "Read", status: "in_progress" as const, at: 4 }];
    expect(shouldClearBusyOnSettledChat({ busy: true, now: 9_000, items: live })).toBe(false);
  });

  it("does not treat the user send time as the end of the turn", () => {
    const noClock = [
      { kind: "user" as const, id: "u", text: "ping", at: 1 },
      { kind: "assistant" as const, id: "a", text: "pong" },
    ];
    expect(shouldClearBusyOnSettledChat({ busy: true, now: 1 + 4000, items: noClock })).toBe(false);
    expect(
      shouldClearBusyOnSettledChat({
        busy: true,
        now: 10_000,
        items: noClock,
        seenAssistantAt: 10_000 - 4000,
      }),
    ).toBe(true);
  });
});

describe("formatElapsed", () => {
  it("formats seconds then minutes", () => {
    expect(formatElapsed(0)).toBe("0秒");
    expect(formatElapsed(12_000)).toBe("12秒");
    expect(formatElapsed(65_000)).toBe("1分5秒");
    expect(formatElapsed(3600_000)).toBe("1小时");
  });
});
