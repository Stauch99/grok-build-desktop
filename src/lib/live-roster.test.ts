import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import type { SessionSummary } from "../api";
import {
  isLiveRosterId,
  liveBusyIds,
  liveRosterFromTools,
  liveRosterId,
  lookupSession,
  mergeLiveRoster,
  parentsToExpandForLive,
  sessionToOpen,
  sessionsWithLiveRoster,
} from "./live-roster";

function tool(partial: Pick<ChatItem & { kind: "tool" }, "id" | "title" | "status">): ChatItem {
  return { kind: "tool", ...partial };
}

function row(partial: Partial<SessionSummary> & Pick<SessionSummary, "id">): SessionSummary {
  return {
    cwd: "/work",
    title: partial.id,
    updatedAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-31T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

describe("liveRosterFromTools", () => {
  it("emits live children only for running Task tools", () => {
    const items: ChatItem[] = [
      tool({ id: "c1", title: "Task: 中文技巧", status: "in_progress" }),
      tool({ id: "c2", title: "Task: 英文技巧", status: "completed" }),
      tool({ id: "b", title: "bash", status: "in_progress" }),
    ];
    const live = liveRosterFromTools(items, {
      agentId: "claude",
      parentSessionId: "parent",
      cwd: "/work",
      nowIso: "2026-08-31T11:00:00.000Z",
    });
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      id: liveRosterId("claude", "c1"),
      parentSessionId: "parent",
      agentId: "claude",
      sessionKind: "subagent",
      title: "中文技巧",
      cwd: "/work",
      numMessages: 1,
    });
    expect(isLiveRosterId(live[0].id)).toBe(true);
  });
});

describe("mergeLiveRoster", () => {
  it("appends live rows and skips duplicate ids", () => {
    const id = liveRosterId("claude", "c1");
    const disk = [row({ id: "parent", title: "main" }), row({ id, title: "already" })];
    const live = [row({ id, title: "live", parentSessionId: "parent", sessionKind: "subagent" })];
    const out = mergeLiveRoster(disk, live);
    expect(out.filter((s) => s.id === id)).toHaveLength(1);
    expect(out.some((s) => s.id === "parent")).toBe(true);
  });
});

describe("sessionToOpen", () => {
  it("opens the parent when the clicked row is live", () => {
    const parent = row({ id: "parent", title: "main" });
    const live = row({
      id: liveRosterId("claude", "c1"),
      parentSessionId: "parent",
      sessionKind: "subagent",
    });
    expect(sessionToOpen(live, [parent, live]).id).toBe("parent");
    expect(sessionToOpen(parent, [parent, live]).id).toBe("parent");
  });
});

describe("lookupSession", () => {
  const parent = row({ id: "parent", title: "main" });
  const live = row({
    id: liveRosterId("claude", "c1"),
    parentSessionId: "parent",
    sessionKind: "subagent",
  });

  it("returns the parent when a live id is in the list", () => {
    expect(lookupSession(live.id, [parent, live])).toEqual(parent);
  });

  it("returns the live row when its parent is missing", () => {
    expect(lookupSession(live.id, [live])).toEqual(live);
  });

  it("returns the matching ordinary row", () => {
    expect(lookupSession("parent", [parent, live])).toEqual(parent);
  });

  it("returns null for an unknown id", () => {
    expect(lookupSession("missing", [parent, live])).toBeNull();
  });
});

describe("liveBusyIds", () => {
  it("returns live roster ids and skips disk rows", () => {
    const liveId = liveRosterId("claude", "c1");
    expect(
      liveBusyIds([
        row({ id: "parent" }),
        row({ id: liveId, parentSessionId: "parent", sessionKind: "subagent" }),
        row({ id: "disk-child", parentSessionId: "parent", sessionKind: "subagent" }),
      ]),
    ).toEqual([liveId]);
  });
});

describe("parentsToExpandForLive", () => {
  it("returns parents of live children", () => {
    expect(
      parentsToExpandForLive([
        row({ id: "parent" }),
        row({ id: liveRosterId("claude", "c1"), parentSessionId: "parent", sessionKind: "subagent" }),
      ]),
    ).toEqual(["parent"]);
  });
});

describe("sessionsWithLiveRoster", () => {
  it("no-ops without a parent id", () => {
    const base = [row({ id: "a" })];
    expect(
      sessionsWithLiveRoster(base, [], {
        agentId: "claude",
        parentSessionId: null,
        cwd: "/w",
        nowIso: "t",
      }),
    ).toBe(base);
  });
});
