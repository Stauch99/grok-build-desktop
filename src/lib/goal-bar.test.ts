import { describe, expect, it } from "vitest";
import { goalFromPlan, nextGoalView, type GoalView } from "./goal-bar";
import type { PlanEntry } from "./chat";

describe("goalFromPlan", () => {
  it("returns the first unfinished plan entry", () => {
    const plan: PlanEntry[] = [
      { content: "done", status: "completed" },
      { content: "next", status: "pending" },
    ];
    expect(goalFromPlan(plan)).toBe("next");
    expect(goalFromPlan([])).toBeNull();
  });
});

describe("nextGoalView", () => {
  const prev: GoalView = { text: "next", startedAt: 1000, status: "pending" };

  it("starts a timer when a goal appears", () => {
    expect(nextGoalView([{ content: "next", status: "pending" }], null, 50)).toEqual({
      text: "next",
      startedAt: 50,
      status: "pending",
    });
  });

  it("keeps startedAt while the same goal is current", () => {
    expect(nextGoalView([{ content: "next", status: "in_progress" }], prev, 9000)).toEqual({
      text: "next",
      startedAt: 1000,
      status: "in_progress",
    });
  });

  it("restarts when the current goal text changes", () => {
    expect(nextGoalView([{ content: "other", status: "pending" }], prev, 40)).toEqual({
      text: "other",
      startedAt: 40,
      status: "pending",
    });
  });

  it("clears when the plan is finished", () => {
    expect(nextGoalView([{ content: "next", status: "completed" }], prev, 80)).toBeNull();
  });
});
