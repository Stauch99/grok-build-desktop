import { readFileSync } from "node:fs";
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
  applyLiveParentExpand,
  runningChildSessionIds,
  sessionToOpen,
  sessionsWithLiveRoster,
} from "./live-roster";

function tool(
  partial: Pick<ChatItem & { kind: "tool" }, "id" | "title" | "status"> & {
    toolName?: string;
    detail?: string;
  },
): ChatItem {
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

  it("emits live children for Grok spawn tools after the title is overwritten", () => {
    const items: ChatItem[] = [
      tool({
        id: "c1",
        title: "解读 Attention Is All You Need",
        toolName: "spawn_subagent",
        status: "in_progress",
      }),
    ];
    const live = liveRosterFromTools(items, {
      agentId: "grok",
      parentSessionId: "parent",
      cwd: "/work",
      nowIso: "2026-08-31T11:00:00.000Z",
    });
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      id: liveRosterId("grok", "c1"),
      title: "解读 Attention Is All You Need",
      sessionKind: "subagent",
    });
  });

  it("uses the spawned child session id once Grok returns subagent_id", () => {
    const items: ChatItem[] = [
      tool({
        id: "c1",
        title: "T2C 健康与幸福感",
        toolName: "spawn_subagent",
        status: "in_progress",
        detail:
          "Subagent started in background.\nsubagent_id: 01a0787b-8ce7-7253-9afb-f0f8c55334c5\ntype: general-purpose",
      }),
    ];
    const live = liveRosterFromTools(items, {
      agentId: "grok",
      parentSessionId: "parent",
      cwd: "/work",
      nowIso: "2026-08-31T11:00:00.000Z",
    });
    expect(live[0]?.id).toBe("01a0787b-8ce7-7253-9afb-f0f8c55334c5");
    expect(isLiveRosterId(live[0]?.id ?? "")).toBe(false);
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

  it("opens a disk child whose toolUseId matches the live tool", () => {
    const parent = row({ id: "parent", title: "main" });
    const live = row({
      id: liveRosterId("claude", "toolu_1"),
      parentSessionId: "parent",
      sessionKind: "subagent",
    });
    const disk = row({
      id: "child-disk",
      parentSessionId: "parent",
      sessionKind: "subagent",
      toolUseId: "toolu_1",
    });
    expect(sessionToOpen(live, [parent, live, disk]).id).toBe("child-disk");
  });

  it("opens the disk child when a live row already uses that session id", () => {
    const parent = row({ id: "parent", title: "main" });
    const child = row({
      id: "01a0787b-8ce7-7253-9afb-f0f8c55334c5",
      parentSessionId: "parent",
      sessionKind: "subagent",
      title: "T2C 健康与幸福感",
    });
    expect(sessionToOpen(child, [parent, child]).id).toBe(child.id);
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

describe("runningChildSessionIds", () => {
  it("returns spawned child ids only while the spawn tool is running", () => {
    const running: ChatItem[] = [
      tool({
        id: "c1",
        title: "T2C",
        toolName: "spawn_subagent",
        status: "in_progress",
        detail: "subagent_id: 01a0787b-8ce7-7253-9afb-f0f8c55334c5",
      }),
    ];
    expect(runningChildSessionIds(running)).toEqual(["01a0787b-8ce7-7253-9afb-f0f8c55334c5"]);
    expect(
      runningChildSessionIds([
        tool({
          id: "c1",
          title: "T2C",
          toolName: "spawn_subagent",
          status: "completed",
          detail: "subagent_id: 01a0787b-8ce7-7253-9afb-f0f8c55334c5",
        }),
      ]),
    ).toEqual([]);
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

describe("applyLiveParentExpand", () => {
  it("does not force-open a parent the user collapsed", () => {
    const next = applyLiveParentExpand(new Set(["parent"]), new Set(), ["parent"]);
    expect(next.collapsed.has("parent")).toBe(true);
    expect(next.expanded.has("parent")).toBe(false);
  });

  it("is not reapplied from the model effects hook", () => {
    const src = readFileSync(new URL("../hooks/useAppModelEffects.ts", import.meta.url), "utf8");
    expect(src).not.toContain("parentsToExpandForLive");
    expect(src).not.toContain("applyLiveParentExpand");
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
