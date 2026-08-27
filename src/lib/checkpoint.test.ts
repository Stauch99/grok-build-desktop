import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import { checkpointIndexes, describePlan, planRevert, previewRevert } from "./checkpoint";

const user = (id: string, text = "做点事"): ChatItem => ({ kind: "user", id, text });
const assistant = (id: string): ChatItem => ({ kind: "assistant", id, text: "好的" });
const tool = (
  id: string,
  path?: string,
  oldText?: string | null,
): ChatItem => ({
  kind: "tool",
  id,
  title: `edit ${path ?? "?"}`,
  status: "completed",
  diff: path ? { path, oldText: oldText ?? null, newText: "new" } : undefined,
});

describe("checkpointIndexes", () => {
  it("returns the index of every user turn", () => {
    const items = [user("u1"), assistant("a1"), tool("t1", "a.ts", "old"), user("u2")];
    expect(checkpointIndexes(items)).toEqual([0, 3]);
  });

  it("is empty with no user turns", () => {
    expect(checkpointIndexes([assistant("a1")])).toEqual([]);
  });
});

describe("planRevert", () => {
  it("restores the content as of the checkpoint", () => {
    const items = [user("u1"), tool("t1", "a.ts", "v1"), tool("t2", "a.ts", "v2")];
    expect(planRevert(items, 1)).toEqual({
      steps: [{ kind: "restore", path: "a.ts", text: "v1" }],
      unknown: [],
    });
  });

  it("keeps only the first diff per path", () => {
    const items = [
      user("u1"),
      tool("t1", "a.ts", "v1"),
      tool("t2", "b.ts", "w1"),
      tool("t3", "a.ts", "v2"),
    ];
    const plan = planRevert(items, 1);
    expect(plan.steps).toEqual([
      { kind: "restore", path: "a.ts", text: "v1" },
      { kind: "restore", path: "b.ts", text: "w1" },
    ]);
  });

  it("plans a delete when there was no previous content", () => {
    const items = [user("u1"), tool("t1", "new.ts", null)];
    expect(planRevert(items, 1).steps).toEqual([{ kind: "delete", path: "new.ts" }]);
  });

  it("ignores everything before the checkpoint", () => {
    const items = [tool("t0", "before.ts", "x"), user("u1"), tool("t1", "after.ts", "y")];
    const plan = planRevert(items, 2);
    expect(plan.steps).toEqual([{ kind: "restore", path: "after.ts", text: "y" }]);
  });

  it("records tool calls whose diff has no path", () => {
    const items = [user("u1"), { ...tool("t1"), diff: { path: "", newText: "x" } } as ChatItem];
    const plan = planRevert(items, 1);
    expect(plan.steps).toEqual([]);
    expect(plan.unknown).toHaveLength(1);
  });

  it("is empty when nothing touched a file", () => {
    expect(planRevert([user("u1"), assistant("a1")], 1)).toEqual({ steps: [], unknown: [] });
  });
});

describe("previewRevert", () => {
  it("pairs the checkpoint oldText with the last newText", () => {
    const items = [
      user("u1"),
      tool("t1", "a.ts", "v1"),
      { ...tool("t2", "a.ts", "v2"), diff: { path: "a.ts", oldText: "v2", newText: "v3" } } as ChatItem,
    ];
    expect(previewRevert(items, 1)).toEqual([
      { path: "a.ts", kind: "restore", current: "v3", restored: "v1" },
    ]);
  });

  it("uses empty restored text for a delete", () => {
    const items = [user("u1"), tool("t1", "new.ts", null)];
    expect(previewRevert(items, 1)).toEqual([
      { path: "new.ts", kind: "delete", current: "new", restored: "" },
    ]);
  });
});

describe("describePlan", () => {
  it("counts restores and deletes separately", () => {
    const plan = planRevert(
      [user("u1"), tool("t1", "a.ts", "v1"), tool("t2", "b.ts", null)],
      1,
    );
    expect(describePlan(plan)).toBe("恢复 1 个文件，删除 1 个新建文件");
  });

  it("has a sentence for the empty plan", () => {
    expect(describePlan({ steps: [], unknown: [] })).toBe("没有可还原的文件改动");
  });
});
