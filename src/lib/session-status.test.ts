import { describe, expect, it } from "vitest";
import {
  attentionCount,
  clearUnread,
  deriveStatus,
  isAttention,
  loadUnread,
  markUnread,
  pruneUnread,
  statusLabel,
  statusOrder,
  type UnreadMap,
} from "./session-status";

const base = { id: "s1", busyIds: [] as string[], awaitingId: null, unread: {} as UnreadMap };

describe("deriveStatus", () => {
  it("is idle with nothing going on", () => {
    expect(deriveStatus(base)).toBe("idle");
  });

  it("is working while this session runs", () => {
    expect(deriveStatus({ ...base, busyIds: ["s1"] })).toBe("working");
  });

  it("ignores other sessions being busy", () => {
    expect(deriveStatus({ ...base, busyIds: ["s2"] })).toBe("idle");
  });

  it("puts a pending permission above everything", () => {
    expect(
      deriveStatus({ ...base, busyIds: ["s1"], awaitingId: "s1", unread: { s1: "error" } }),
    ).toBe("needs-you");
  });

  it("prefers error over done", () => {
    expect(deriveStatus({ ...base, unread: { s1: "error" } })).toBe("error");
    expect(deriveStatus({ ...base, unread: { s1: "done" } })).toBe("done");
  });

  it("lets a live run outrank a stale unread mark", () => {
    expect(deriveStatus({ ...base, busyIds: ["s1"], unread: { s1: "done" } })).toBe("working");
  });
});

describe("statusLabel and ordering", () => {
  it("leaves idle unlabelled so quiet rows stay quiet", () => {
    expect(statusLabel("idle")).toBe("");
  });

  it("labels every attention state", () => {
    expect(statusLabel("needs-you")).toBe("等你确认");
    expect(statusLabel("error")).toBe("出错，未查看");
  });

  it("sorts by cost of waiting, not recency", () => {
    const sorted = (["idle", "working", "done", "error", "needs-you"] as const)
      .slice()
      .sort((a, b) => statusOrder(a) - statusOrder(b));
    expect(sorted).toEqual(["needs-you", "error", "done", "working", "idle"]);
  });

  it("flags only the states that block you", () => {
    expect(isAttention("needs-you")).toBe(true);
    expect(isAttention("error")).toBe(true);
    expect(isAttention("done")).toBe(false);
    expect(isAttention("working")).toBe(false);
  });
});

describe("unread map", () => {
  it("marks and clears", () => {
    const marked = markUnread({}, "s1", "done");
    expect(marked).toEqual({ s1: "done" });
    expect(clearUnread(marked, "s1")).toEqual({});
  });

  it("returns the same object when nothing changes", () => {
    const m: UnreadMap = { s1: "done" };
    expect(markUnread(m, "s1", "done")).toBe(m);
    expect(clearUnread(m, "s2")).toBe(m);
  });

  it("ignores a blank id", () => {
    expect(markUnread({}, "", "done")).toEqual({});
  });

  it("upgrades done to error", () => {
    expect(markUnread({ s1: "done" }, "s1", "error")).toEqual({ s1: "error" });
  });

  it("prunes entries for deleted sessions", () => {
    expect(pruneUnread({ s1: "done", s2: "error" }, ["s2"])).toEqual({ s2: "error" });
  });

  it("loads only valid marks from disk", () => {
    expect(loadUnread({ s1: "done", s2: "nope", s3: 5, s4: "error" })).toEqual({
      s1: "done",
      s4: "error",
    });
    expect(loadUnread(null)).toEqual({});
    expect(loadUnread("x")).toEqual({});
  });
});

describe("attentionCount", () => {
  it("counts errors plus a live permission prompt", () => {
    expect(attentionCount({ s1: "error", s2: "done", s3: "error" }, "s9")).toBe(3);
  });

  it("does not count plain completions", () => {
    expect(attentionCount({ s1: "done", s2: "done" }, null)).toBe(0);
  });
});
