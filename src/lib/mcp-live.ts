import { parseMcpJson, type McpServer } from "./agents-store";

export type ClaudeMcpEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "http" | "sse";
  url?: string;
};

function envRecord(env?: string[]): Record<string, string> | undefined {
  if (!env?.length) return undefined;
  const out: Record<string, string> = {};
  for (const row of env) {
    const i = row.indexOf("=");
    if (i <= 0) continue;
    out[row.slice(0, i)] = row.slice(i + 1);
  }
  return Object.keys(out).length ? out : undefined;
}

export function mcpServerToClaude(server: McpServer): ClaudeMcpEntry {
  if (server.transport === "http" || server.transport === "sse") {
    const entry: ClaudeMcpEntry = { type: server.transport };
    if (server.commandOrUrl) entry.url = server.commandOrUrl;
    return entry;
  }
  const entry: ClaudeMcpEntry = {};
  if (server.commandOrUrl) entry.command = server.commandOrUrl;
  if (server.args?.length) entry.args = server.args;
  const env = envRecord(server.env);
  if (env) entry.env = env;
  return entry;
}

function asObject(doc: unknown): Record<string, unknown> {
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    return { ...(doc as Record<string, unknown>) };
  }
  return {};
}

function mcpServersMap(doc: Record<string, unknown>): Record<string, unknown> {
  const raw = doc.mcpServers;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export function mergeClaudeMcpDoc(doc: unknown, servers: McpServer[]): Record<string, unknown> {
  const next = asObject(doc);
  const map = mcpServersMap(next);
  for (const server of servers) {
    map[server.name] = mcpServerToClaude(server);
  }
  next.mcpServers = map;
  return next;
}

export function removeClaudeMcpServer(doc: unknown, name: string): Record<string, unknown> {
  const next = asObject(doc);
  const map = mcpServersMap(next);
  delete map[name];
  next.mcpServers = map;
  return next;
}

export function mergeKimiMcpDoc(doc: unknown, servers: McpServer[]): { servers: McpServer[] } {
  const map = new Map(parseMcpJson(doc).map((row) => [row.name, row]));
  for (const row of servers) map.set(row.name, row);
  return { servers: [...map.values()] };
}

export function removeKimiMcpServer(doc: unknown, name: string): { servers: McpServer[] } {
  return { servers: parseMcpJson(doc).filter((row) => row.name !== name) };
}
