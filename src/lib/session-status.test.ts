import { describe, expect, it } from "vitest";
import {
  busySessionIds,
  clearUnread,
  deriveStatus,
  isAttention,
  loadUnread,
  markUnread,
  pruneUnread,
  sidebarWorkingIds,
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

describe("busySessionIds", () => {
  it("marks a new session that is busy before runningSessionId catches up", () => {
    expect(
      busySessionIds({
        busy: true,
        sessionId: "new-1",
        runningSessionId: null,
      }),
    ).toEqual(["new-1"]);
  });

  it("prefers the running id when the open pane is a different session", () => {
    expect(
      busySessionIds({
        busy: true,
        sessionId: "open",
        runningSessionId: "run",
      }),
    ).toEqual(["run"]);
  });

  it("stays empty when nothing is running", () => {
    expect(
      busySessionIds({
        busy: false,
        sessionId: "open",
        runningSessionId: null,
      }),
    ).toEqual([]);
  });

  it("keeps a background session working while the open pane is idle", () => {
    expect(
      busySessionIds({
        busy: false,
        sessionId: "open",
        runningSessionId: "run",
      }),
    ).toEqual(["run"]);
  });

  it("includes every live lease id, not only the primary", () => {
    expect(
      busySessionIds({
        busy: false,
        sessionId: "open",
        runningSessionId: "run",
        runningIds: ["run", "other"],
      }),
    ).toEqual(["run", "other"]);
  });
});

describe("sidebarWorkingIds", () => {
  it("does not keep live children working after this window has idled", () => {
    expect(
      sidebarWorkingIds({
        busy: false,
        sessionId: "parent",
        runningSessionId: null,
        liveRosterIds: ["live:grok:c1"],
        runningChildIds: ["child-1"],
      }),
    ).toEqual([]);
  });

  it("includes live children only while this window is driving a turn", () => {
    expect(
      sidebarWorkingIds({
        busy: true,
        sessionId: "parent",
        runningSessionId: "parent",
        liveRosterIds: ["live:grok:c1"],
        runningChildIds: ["child-1"],
      }),
    ).toEqual(["parent", "live:grok:c1", "child-1"]);
  });
});

