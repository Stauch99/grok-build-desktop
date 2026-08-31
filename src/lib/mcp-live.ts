import { parseMcpJson, type McpServer } from "./agents-store";

export type ClaudeMcpEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  type?: "http" | "sse";
  url?: string;
};

function kvRecord(rows?: string[]): Record<string, string> | undefined {
  if (!rows?.length) return undefined;
  const out: Record<string, string> = {};
  for (const row of rows) {
    const i = row.indexOf("=");
    if (i <= 0) continue;
    out[row.slice(0, i)] = row.slice(i + 1);
  }
  return Object.keys(out).length ? out : undefined;
}

function headersList(headers?: Record<string, string>): string[] | undefined {
  if (!headers) return undefined;
  const keys = Object.keys(headers).sort();
  if (!keys.length) return undefined;
  return keys.map((k) => `${k}=${headers[k]}`);
}

function asStringRecord(val: unknown): Record<string, string> | undefined {
  if (!val || typeof val !== "object" || Array.isArray(val)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function applyClaudeHeaders(entry: ClaudeMcpEntry, server: McpServer): void {
  const headers = kvRecord(server.headers);
  if (headers) entry.headers = headers;
}

export function mcpServerToClaude(server: McpServer): ClaudeMcpEntry {
  if (server.transport === "http" || server.transport === "sse") {
    const entry: ClaudeMcpEntry = { type: server.transport };
    if (server.commandOrUrl) entry.url = server.commandOrUrl;
    applyClaudeHeaders(entry, server);
    return entry;
  }
  const entry: ClaudeMcpEntry = {};
  if (server.commandOrUrl) entry.command = server.commandOrUrl;
  if (server.args?.length) entry.args = server.args;
  const env = kvRecord(server.env);
  if (env) entry.env = env;
  applyClaudeHeaders(entry, server);
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

export type CodexMcpEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

export function mcpServerToCodex(server: McpServer): CodexMcpEntry {
  if (server.transport === "http" || server.transport === "sse") {
    const entry: CodexMcpEntry = {};
    if (server.commandOrUrl) entry.url = server.commandOrUrl;
    return entry;
  }
  const entry: CodexMcpEntry = {};
  if (server.commandOrUrl) entry.command = server.commandOrUrl;
  if (server.args?.length) entry.args = server.args;
  const env = kvRecord(server.env);
  if (env) entry.env = env;
  return entry;
}

export function firstOpenMcpImport(
  canonical: McpServer[],
  live: McpServer[],
): { catalog: McpServer[]; conflicts: string[] } {
  const catalog = [...canonical];
  const byName = new Map(canonical.map((row) => [row.name, row]));
  const conflicts: string[] = [];

  for (const row of live) {
    const existing = byName.get(row.name);
    if (!existing) {
      catalog.push(row);
      byName.set(row.name, row);
      continue;
    }
    const canonCmd = existing.commandOrUrl ?? "";
    const liveCmd = row.commandOrUrl ?? "";
    if (existing.transport === row.transport && canonCmd === liveCmd) continue;
    conflicts.push(row.name);
  }

  return { catalog, conflicts };
}

export function mergeCodexMcpTables(
  existing: Record<string, CodexMcpEntry>,
  servers: McpServer[],
): Record<string, CodexMcpEntry> {
  const next = { ...existing };
  for (const server of servers) next[server.name] = mcpServerToCodex(server);
  return next;
}

export function removeCodexMcpServer(
  existing: Record<string, CodexMcpEntry>,
  name: string,
): Record<string, CodexMcpEntry> {
  const next = { ...existing };
  delete next[name];
  return next;
}

export function parseClaudeMcpDoc(doc: unknown): McpServer[] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [];
  const raw = (doc as Record<string, unknown>).mcpServers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: McpServer[] = [];
  for (const [name, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!name || !val || typeof val !== "object" || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    const headers = headersList(asStringRecord(rec.headers));
    if (rec.type === "http" || rec.type === "sse") {
      const row: McpServer = { name, transport: rec.type };
      if (typeof rec.url === "string") row.commandOrUrl = rec.url;
      if (headers) row.headers = headers;
      out.push(row);
      continue;
    }
    if (typeof rec.command !== "string") continue;
    const row: McpServer = { name, transport: "stdio", commandOrUrl: rec.command };
    const args = rec.args;
    if (Array.isArray(args) && args.every((x) => typeof x === "string")) row.args = args as string[];
    if (headers) row.headers = headers;
    out.push(row);
  }
  return out;
}
