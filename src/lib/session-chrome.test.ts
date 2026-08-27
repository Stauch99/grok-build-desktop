import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import {
  isArchived,
  isPinned,
  partitionPinned,
  shouldAutoExpand,
  toggleId,
  visibleSessions,
} from "./session-chrome";

function s(
  partial: Partial<SessionSummary> & Pick<SessionSummary, "id">,
): SessionSummary {
  return {
    cwd: "/p",
    title: partial.id,
    updatedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

describe("toggleId", () => {
  it("adds missing id", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
  });
  it("removes existing id", () => {
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("isPinned / isArchived", () => {
  it("checks membership", () => {
    expect(isPinned(["x", "y"], "x")).toBe(true);
    expect(isPinned(["x"], "z")).toBe(false);
    expect(isArchived(["a"], "a")).toBe(true);
    expect(isArchived([], "a")).toBe(false);
  });
});

describe("visibleSessions", () => {
  const now = Date.parse("2026-08-15T12:00:00.000Z");
  const recent = "2026-08-14T00:00:00.000Z";
  const old = "2026-07-01T00:00:00.000Z";

  it("hides drafts with zero messages", () => {
    const list = visibleSessions(
      [s({ id: "draft", numMessages: 0, updatedAt: recent }), s({ id: "live", updatedAt: recent })],
      { pinned: [], archived: [], view: "active", autoArchiveDays: 0, now },
    );
    expect(list.map((x) => x.id)).toEqual(["live"]);
  });

  it("hides archived ids from active view", () => {
    const list = visibleSessions(
      [s({ id: "a", updatedAt: recent }), s({ id: "b", updatedAt: recent })],
      { pinned: [], archived: ["b"], view: "active", autoArchiveDays: 0, now },
    );
    expect(list.map((x) => x.id)).toEqual(["a"]);
  });

  it("auto-archives stale sessions unless pinned", () => {
    const sessions = [
      s({ id: "stale", updatedAt: old }),
      s({ id: "pinned-stale", updatedAt: old }),
      s({ id: "fresh", updatedAt: recent }),
    ];
    const active = visibleSessions(sessions, {
      pinned: ["pinned-stale"],
      archived: [],
      view: "active",
      autoArchiveDays: 7,
      now,
    });
    expect(active.map((x) => x.id)).toEqual(["pinned-stale", "fresh"]);

    const archived = visibleSessions(sessions, {
      pinned: ["pinned-stale"],
      archived: [],
      view: "archived",
      autoArchiveDays: 7,
      now,
    });
    expect(archived.map((x) => x.id)).toEqual(["stale"]);
  });

  it("skips auto-archive when days is 0", () => {
    const list = visibleSessions([s({ id: "stale", updatedAt: old })], {
      pinned: [],
      archived: [],
      view: "active",
      autoArchiveDays: 0,
      now,
    });
    expect(list.map((x) => x.id)).toEqual(["stale"]);
  });

  it("archived view shows explicit archive and auto-archive", () => {
    const list = visibleSessions(
      [
        s({ id: "manual", updatedAt: recent }),
        s({ id: "stale", updatedAt: old }),
        s({ id: "fresh", updatedAt: recent }),
      ],
      { pinned: [], archived: ["manual"], view: "archived", autoArchiveDays: 14, now },
    );
    expect(list.map((x) => x.id)).toEqual(["manual", "stale"]);
  });

  it("hides drafts from archived view too", () => {
    const list = visibleSessions(
      [s({ id: "empty", numMessages: 0, updatedAt: old })],
      { pinned: [], archived: ["empty"], view: "archived", autoArchiveDays: 7, now },
    );
    expect(list).toEqual([]);
  });
});

describe("partitionPinned", () => {
  it("splits pinned vs rest preserving order", () => {
    const sessions = [s({ id: "a" }), s({ id: "b" }), s({ id: "c" })];
    const { pinned, rest } = partitionPinned(sessions, ["c", "a"]);
    expect(pinned.map((x) => x.id)).toEqual(["a", "c"]);
    expect(rest.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("shouldAutoExpand", () => {
  it("does not expand when only the parent is active", () => {
    expect(shouldAutoExpand("p", "p", ["c"])).toBe(false);
  });
  it("expands when active is a descendant", () => {
    expect(shouldAutoExpand("p", "gc", ["c", "gc"])).toBe(true);
  });
  it("stays collapsed otherwise", () => {
    expect(shouldAutoExpand("p", "other", ["c"])).toBe(false);
    expect(shouldAutoExpand("p", null, ["c"])).toBe(false);
  });
});
