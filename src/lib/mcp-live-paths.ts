import type { AgentId } from "./agent-id";
import { mcpJsonPath, type McpServer } from "./agents-store";

const LIVE_MCP_PATHS: Record<AgentId, string> = {
  grok: "/.grok/config.toml",
  kimi: "/.kimi-code/mcp.json",
  claude: "/.claude.json",
  codex: "/.codex/config.toml",
};

export function liveMcpPath(home: string, id: AgentId): string {
  return `${home.replace(/\/+$/, "")}${LIVE_MCP_PATHS[id]}`;
}

export function agentsMcpPath(agentsHome: string): string {
  return mcpJsonPath(agentsHome);
}

export function upsertMcpCatalog(catalog: McpServer[], server: McpServer): McpServer[] {
  const idx = catalog.findIndex((row) => row.name === server.name);
  if (idx === -1) return [...catalog, server];
  const out = [...catalog];
  out[idx] = server;
  return out;
}

export function removeMcpCatalog(catalog: McpServer[], name: string): McpServer[] {
  return catalog.filter((row) => row.name !== name);
}
