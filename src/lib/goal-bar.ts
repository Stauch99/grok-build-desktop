import type { PlanEntry } from "./chat";

export type GoalView = {
  text: string;
  startedAt: number;
  status: "pending" | "in_progress";
};

function openPlanEntry(plan: PlanEntry[]): PlanEntry | null {
  return plan.find((e) => {
    const s = (e.status ?? "pending").toLowerCase();
    return s !== "completed" && s !== "complete" && s !== "done";
  }) ?? null;
}

export function goalFromPlan(plan: PlanEntry[]): string | null {
  return openPlanEntry(plan)?.content?.trim() || null;
}

function goalStatus(entry: PlanEntry): GoalView["status"] {
  return (entry.status ?? "pending").toLowerCase() === "in_progress" ? "in_progress" : "pending";
}

/** Keep the timer when the same goal stays current; restart when the text changes. */
export function nextGoalView(
  plan: PlanEntry[],
  prev: GoalView | null,
  now: number,
): GoalView | null {
  const entry = openPlanEntry(plan);
  const text = entry?.content?.trim() || "";
  if (!entry || !text) return null;
  const status = goalStatus(entry);
  if (prev && prev.text === text) return { ...prev, status };
  return { text, startedAt: now, status };
}
