import type { McpServer } from "./agents-store";
import { mcpAddArgv } from "./grok-cli";
import {
  mergeCodexMcpTables,
  mcpServerToCodex,
  removeCodexMcpServer,
} from "./mcp-live";

export function grokMcpWriteArgv(
  server: McpServer,
  scope?: "user" | "project",
): string[] {
  return mcpAddArgv({ ...server, scope });
}

export const mergeGrokMcpTables = mergeCodexMcpTables;
export const removeGrokMcpServer = removeCodexMcpServer;
export const mcpServerToGrokToml = mcpServerToCodex;
