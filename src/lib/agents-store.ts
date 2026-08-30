import { AGENT_IDS, type AgentId } from "./agent-id";

export type McpTransport = "stdio" | "http" | "sse";

export type McpServer = {
  name: string;
  transport: McpTransport;
  commandOrUrl?: string;
  args?: string[];
  env?: string[];
  headers?: string[];
};

export type SyncFlags = Record<AgentId, boolean>;

export type AgentsSync = {
  skills: Record<string, SyncFlags>;
  mcp: Record<string, SyncFlags>;
};

export function defaultAgentsHome(home: string): string {
  return `${home.replace(/\/$/, "")}/.agents`;
}

export function skillDir(agentsHome: string, name: string): string {
  return `${agentsHome}/skills/${name}`;
}

export function mcpJsonPath(agentsHome: string): string {
  return `${agentsHome}/mcp.json`;
}

export function syncJsonPath(agentsHome: string): string {
  return `${agentsHome}/sync.json`;
}

export function skillNameOk(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

export function defaultSyncFlags(): SyncFlags {
  return { grok: true, kimi: true, claude: true, codex: true };
}

export function mergeMcpCatalog(canonical: McpServer[], imported: McpServer[]): McpServer[] {
  const out = [...canonical];
  const seen = new Set(canonical.map((s) => s.name));
  for (const row of imported) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(row);
  }
  return out;
}

export function mcpServersForAgent(
  catalog: McpServer[],
  sync: AgentsSync,
  agentId: AgentId,
): McpServer[] {
  return catalog.filter((row) => {
    const flags = sync.mcp[row.name];
    if (!flags) return true;
    return flags[agentId] === true;
  });
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return undefined;
  return v as string[];
}

export function parseMcpJson(raw: unknown): McpServer[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const servers = (raw as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) return [];
  const out: McpServer[] = [];
  for (const item of servers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const transport = rec.transport;
    if (!name || (transport !== "stdio" && transport !== "http" && transport !== "sse")) continue;
    const row: McpServer = { name, transport };
    if (typeof rec.commandOrUrl === "string") row.commandOrUrl = rec.commandOrUrl;
    const args = asStringArray(rec.args);
    if (args) row.args = args;
    const env = asStringArray(rec.env);
    if (env) row.env = env;
    const headers = asStringArray(rec.headers);
    if (headers) row.headers = headers;
    out.push(row);
  }
  return out;
}

export function skillMarkdown(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
user-invocable: true
---

# ${name}
`;
}

export function stringifyMcpJson(servers: McpServer[]): string {
  return `${JSON.stringify({ servers }, null, 2)}\n`;
}

export function stringifySyncJson(sync: AgentsSync): string {
  return `${JSON.stringify(sync, null, 2)}\n`;
}

function parseFlags(raw: unknown): SyncFlags {
  const out: SyncFlags = { grok: false, kimi: false, claude: false, codex: false };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const id of AGENT_IDS) {
    if (typeof rec[id] === "boolean") out[id] = rec[id];
  }
  return out;
}

function parseFlagMap(raw: unknown): Record<string, SyncFlags> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: Record<string, SyncFlags> = {};
  for (const [name, flags] of Object.entries(rec)) {
    out[name] = parseFlags(flags);
  }
  return out;
}

export function parseSyncJson(raw: unknown): AgentsSync {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { skills: {}, mcp: {} };
  }
  const rec = raw as Record<string, unknown>;
  return { skills: parseFlagMap(rec.skills), mcp: parseFlagMap(rec.mcp) };
}
