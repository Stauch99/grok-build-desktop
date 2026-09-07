import type { AgentId } from "./agent-id";

export type SubagentStatus = "running" | "completed" | "cancelled" | "failed";
export type McpInheritance = "inherit" | "none";

const DEFAULT_ALIASES = ["spawn_subagent", "task", "agent"] as const;
const POLL_ALIASES = ["get_command_or_subagent_output"] as const;

const EXTRA: Record<AgentId, readonly string[]> = {
  grok: [],
  kimi: ["swarm"],
  claude: [],
  codex: [],
};

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s:_-]+/g, "_");
}

function firstToken(normalized: string): string {
  return normalized.split("_")[0] ?? normalized;
}

function aliasesFor(agentId?: AgentId): string[] {
  const extra = agentId ? EXTRA[agentId] : Object.values(EXTRA).flat();
  return [...new Set([...DEFAULT_ALIASES, ...extra])];
}

function matchesAlias(normalized: string, alias: string): boolean {
  return (
    normalized === alias ||
    normalized.startsWith(`${alias}_`) ||
    firstToken(normalized) === alias
  );
}

function isSubagentTitle(title: string, agentId?: AgentId): boolean {
  const t = norm(title);
  return aliasesFor(agentId).some((alias) => matchesAlias(t, alias));
}

function isPollTitle(title: string): boolean {
  const t = norm(title);
  return POLL_ALIASES.some((alias) => matchesAlias(t, alias));
}

/** Output polls are not independent children. Keep them out of the jobs chip too. */
export function isSubagentPollTool(title: string, toolName?: string): boolean {
  return isPollTitle(title) || (toolName ? isPollTitle(toolName) : false);
}

/** Keep the first matching spawn alias when later ACP updates replace the display title. */
export function stickyToolName(existing: string | undefined, incomingTitle: string, agentId?: AgentId): string | undefined {
  if (existing) return existing;
  const t = incomingTitle.trim();
  if (t && isSubagentTitle(t, agentId)) return t;
  return undefined;
}

export function subagentStatusFromItem(
  item: { title: string; status: string; toolName?: string },
  agentId?: AgentId,
): SubagentStatus | null {
  return (
    subagentStatusFromTool(item.title, item.status, agentId) ??
    (item.toolName ? subagentStatusFromTool(item.toolName, item.status, agentId) : null)
  );
}

function longestMatchingAlias(title: string, agentId?: AgentId): string | null {
  const t = norm(title);
  const matches = aliasesFor(agentId).filter((alias) => matchesAlias(t, alias));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
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
export function subagentStatusFromTool(
  title: string,
  status: string,
  agentId?: AgentId,
): SubagentStatus | null {
  if (!isSubagentTitle(title, agentId)) return null;
  return mapStatus(status);
}

export function subagentDisplayName(title: string): string {
  const alias = longestMatchingAlias(title);
  if (!alias) return title;

  const normalized = norm(title);
  if (normalized === alias) return title;

  const pattern = new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s:_-]*`, "i");
  const stripped = title.replace(pattern, "").trim();
  return stripped || title;
}

export function mcpInheritanceLabel(v?: string): McpInheritance {
  const s = (v ?? "").toLowerCase().trim();
  if (s === "none" || s === "false" || s === "0") return "none";
  return "inherit";
}

/** Grok spawn tool output: `subagent_id: <uuid>`. */
export function childSessionIdFromToolDetail(detail?: string | null): string | null {
  if (!detail) return null;
  const match = detail.match(/subagent_id:\s*([0-9a-zA-Z-]+)/i);
  const id = match?.[1]?.trim();
  return id || null;
}
