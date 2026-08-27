import { describe, expect, it } from "vitest";
import { headerJobs } from "./jobs-header";
import { goalFromPlan } from "./goal-bar";
import { subagentCatalog } from "./subagent-tree";
import type { ChatItem, PlanEntry } from "./chat";

describe("headerJobs", () => {
  it("lists in-progress tools that are not subagents", () => {
    const items: ChatItem[] = [
      { kind: "tool", id: "t1", title: "bash ls", status: "in_progress" },
      { kind: "tool", id: "t2", title: "spawn_subagent researcher", status: "in_progress" },
      { kind: "tool", id: "t3", title: "read", status: "completed" },
    ];
    expect(headerJobs(items)).toEqual([{ id: "t1", title: "bash ls", status: "in_progress" }]);
  });
});

describe("goalFromPlan", () => {
  it("returns the first pending plan entry", () => {
    const plan: PlanEntry[] = [
      { content: "done", status: "completed" },
      { content: "next", status: "pending" },
    ];
    expect(goalFromPlan(plan)).toBe("next");
    expect(goalFromPlan([])).toBeNull();
  });
});

describe("subagentCatalog", () => {
  it("builds a read-only tree from spawn tools", () => {
    const items: ChatItem[] = [
      { kind: "tool", id: "s1", title: "spawn_subagent researcher", status: "in_progress" },
      { kind: "tool", id: "s2", title: "spawn_subagent writer", status: "completed" },
    ];
    expect(subagentCatalog(items)).toEqual([
      { id: "s1", name: "researcher", status: "running" },
      { id: "s2", name: "writer", status: "completed" },
    ]);
  });
});
