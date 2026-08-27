import type { PlanEntry } from "./chat";

export function goalFromPlan(plan: PlanEntry[]): string | null {
  const pending = plan.find((e) => {
    const s = (e.status ?? "pending").toLowerCase();
    return s !== "completed" && s !== "complete" && s !== "done";
  });
  return pending?.content?.trim() || null;
}
