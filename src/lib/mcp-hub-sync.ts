import type { McpServer } from "./agents-store";
import { grokMcpWriteArgv } from "./mcp-grok";
import { syncClaudeLive, syncKimiLive } from "./mcp-sync-apply";

function parseExistingJsonObject(existing: string): unknown {
  const trimmed = existing.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

export function nextClaudeLiveText(
  existing: string,
  enabled: McpServer[],
  disabled: string[],
): string {
  const next = syncClaudeLive(parseExistingJsonObject(existing), enabled, disabled);
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function nextKimiLiveText(
  existing: string,
  enabled: McpServer[],
  disabled: string[],
): string {
  const { servers } = syncKimiLive(parseExistingJsonObject(existing), enabled, disabled);
  return `${JSON.stringify({ servers }, null, 2)}\n`;
}

export function grokMcpAddAfterCatalog(server: McpServer): string[] {
  return grokMcpWriteArgv(server);
}
