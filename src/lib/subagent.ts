export type SubagentStatus = "running" | "completed" | "cancelled" | "failed";
export type McpInheritance = "inherit" | "none";

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function isSubagentTitle(title: string): boolean {
  const t = norm(title);
  return t.includes("spawn_subagent") || t.includes("get_command_or_subagent_output");
}

function mapStatus(status: string): SubagentStatus | null {
  const s = norm(status);
  if (s === "pending" || s === "in_progress" || s === "running") return "running";
  if (s === "completed" || s === "complete" || s === "success") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "failed" || s === "error" || s === "failure") return "failed";
  return null;
}

/** ACP spawn / poll tools only. Anything else returns null. */
export function subagentStatusFromTool(title: string, status: string): SubagentStatus | null {
  if (!isSubagentTitle(title)) return null;
  return mapStatus(status);
}

export function mcpInheritanceLabel(v?: string): McpInheritance {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "none" || s === "false" || s === "0") return "none";
  return "inherit";
}
