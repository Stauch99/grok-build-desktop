import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import {
  emptySpawnWatch,
  forgetSettledSpawn,
  newlySpawnedChildIds,
  parentBusyIds,
  parentIdFromSummaries,
  rememberDiskChild,
  rememberSpawnedChildren,
  shouldMarkRunningOnSessionUpdate,
  shouldSettleRunning,
  shouldStashBackgroundChat,
  spawnedChildIds,
  watchedSessionIds,
} from "./session-watch";

function spawnTool(partial: {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  detail?: string;
}): ChatItem {
  return {
    kind: "tool",
    id: partial.id,
    title: "解读论文",
    toolName: "spawn_subagent",
    status: partial.status,
    detail: partial.detail,
  };
}

describe("spawnedChildIds", () => {
  it("reads Grok subagent_id even after the spawn tool has completed", () => {
    expect(
      spawnedChildIds([
        spawnTool({
          id: "c1",
          status: "completed",
          detail: "subagent_id: 01child-aaaa-bbbb-cccc-ddddeeee",
        }),
        { kind: "tool", id: "bash", title: "Bash", status: "completed" },
      ]),
    ).toEqual(["01child-aaaa-bbbb-cccc-ddddeeee"]);
  });
});

describe("rememberSpawnedChildren", () => {
  it("maps parent to child ids and child back to parent", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({
        id: "c1",
        status: "completed",
        detail: "subagent_id: child-1",
      }),
    ]);
    expect(watch.childrenOf.parent).toEqual(["child-1"]);
    expect(watch.parentOf["child-1"]).toBe("parent");
  });

  it("reports only newly seen child ids", () => {
    const items = [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
      spawnTool({ id: "c2", status: "in_progress", detail: "subagent_id: child-2" }),
    ];
    const once = rememberSpawnedChildren(emptySpawnWatch(), "parent", items);
    expect(newlySpawnedChildIds(emptySpawnWatch(), "parent", items)).toEqual(["child-1", "child-2"]);
    expect(newlySpawnedChildIds(once, "parent", items)).toEqual([]);
  });
});

describe("shouldSettleRunning", () => {
  it("keeps a parent running while any spawned child is still in the running set", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
    ]);
    expect(
      shouldSettleRunning({
        sessionId: "parent",
        runningIds: ["parent", "child-1"],
        watch,
      }),
    ).toBe(false);
    expect(
      shouldSettleRunning({
        sessionId: "parent",
        runningIds: ["parent"],
        watch,
      }),
    ).toBe(true);
  });

  it("does not settle while a prompt waiter or open tool is still live", () => {
    expect(
      shouldSettleRunning({
        sessionId: "s",
        runningIds: ["s"],
        watch: emptySpawnWatch(),
        promptPending: true,
      }),
    ).toBe(false);
    expect(
      shouldSettleRunning({
        sessionId: "s",
        runningIds: ["s"],
        watch: emptySpawnWatch(),
        openTools: true,
      }),
    ).toBe(false);
  });

  it("settles a child on its own turn without waiting for siblings", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
      spawnTool({ id: "c2", status: "completed", detail: "subagent_id: child-2" }),
    ]);
    expect(
      shouldSettleRunning({
        sessionId: "child-1",
        runningIds: ["parent", "child-1", "child-2"],
        watch,
      }),
    ).toBe(true);
  });
});

describe("parentBusyIds", () => {
  it("marks the parent working when a spawned child is still running", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
    ]);
    expect(parentBusyIds(watch, ["child-1"])).toEqual(["parent"]);
    expect(parentBusyIds(watch, ["other"])).toEqual([]);
  });
});

describe("watchedSessionIds", () => {
  it("includes running ids plus spawn parents and children", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
    ]);
    expect(watchedSessionIds(["open"], watch).sort()).toEqual(["child-1", "open", "parent"]);
  });
});

describe("shouldMarkRunningOnSessionUpdate", () => {
  it("re-enters running on live work, not on turn_completed", () => {
    expect(shouldMarkRunningOnSessionUpdate({ update: { sessionUpdate: "agent_message_chunk" } })).toBe(true);
    expect(shouldMarkRunningOnSessionUpdate({ update: { sessionUpdate: "tool_call" } })).toBe(true);
    expect(
      shouldMarkRunningOnSessionUpdate({
        update: { sessionUpdate: "tool_call_update", status: "in_progress" },
      }),
    ).toBe(true);
    expect(
      shouldMarkRunningOnSessionUpdate({
        update: { sessionUpdate: "tool_call_update", status: "completed" },
      }),
    ).toBe(false);
    expect(shouldMarkRunningOnSessionUpdate({ update: { sessionUpdate: "turn_completed" } })).toBe(false);
  });
});

describe("shouldStashBackgroundChat", () => {
  it("keeps a parent transcript when it has spawned children, even after the ACP turn idled", () => {
    const items = [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
    ];
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", items);
    expect(shouldStashBackgroundChat({ sessionId: "parent", items, runningIds: [], watch })).toBe(true);
    expect(
      shouldStashBackgroundChat({
        sessionId: "idle",
        items: [{ kind: "assistant", id: "a", text: "hi" }],
        runningIds: [],
        watch: emptySpawnWatch(),
      }),
    ).toBe(false);
  });
});

describe("parentIdFromSummaries", () => {
  it("finds the disk parent of a spawned child", () => {
    expect(
      parentIdFromSummaries(
        [
          { id: "parent" },
          { id: "child-1", parentSessionId: "parent" },
        ],
        "child-1",
      ),
    ).toBe("parent");
    expect(parentIdFromSummaries([{ id: "parent" }], "child-1")).toBeNull();
  });
});

describe("rememberDiskChild", () => {
  it("links a disk child so the parent stays watched", () => {
    const watch = rememberDiskChild(emptySpawnWatch(), "parent", "child-1");
    expect(watch.parentOf["child-1"]).toBe("parent");
    expect(watch.childrenOf.parent).toEqual(["child-1"]);
  });
});

describe("forgetSettledSpawn", () => {
  it("drops a parent only after it and its children have left the running set", () => {
    const watch = rememberSpawnedChildren(emptySpawnWatch(), "parent", [
      spawnTool({ id: "c1", status: "completed", detail: "subagent_id: child-1" }),
    ]);
    expect(forgetSettledSpawn(watch, "parent", ["child-1"])).toEqual(watch);
    const cleared = forgetSettledSpawn(watch, "parent", []);
    expect(cleared.childrenOf.parent).toBeUndefined();
    expect(cleared.parentOf["child-1"]).toBeUndefined();
  });
});
