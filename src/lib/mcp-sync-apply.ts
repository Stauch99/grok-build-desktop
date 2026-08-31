import type { McpServer } from "./agents-store";
import { mergeGrokMcpTables, removeGrokMcpServer } from "./mcp-grok";
import {
  mergeClaudeMcpDoc,
  mergeCodexMcpTables,
  mergeKimiMcpDoc,
  removeClaudeMcpServer,
  removeCodexMcpServer,
  removeKimiMcpServer,
  type CodexMcpEntry,
} from "./mcp-live";

export function applyMcpToClaudeDoc(doc: unknown, enabled: McpServer[]): Record<string, unknown> {
  return mergeClaudeMcpDoc(doc, enabled);
}

export function applyMcpToKimiDoc(doc: unknown, enabled: McpServer[]): { servers: McpServer[] } {
  return mergeKimiMcpDoc(doc, enabled);
}

export function applyMcpToCodexTables(
  existing: Record<string, CodexMcpEntry>,
  enabled: McpServer[],
): Record<string, CodexMcpEntry> {
  return mergeCodexMcpTables(existing, enabled);
}

export const applyMcpToGrokTables = mergeGrokMcpTables;

export function syncClaudeLive(
  doc: unknown,
  enabled: McpServer[],
  disabledNames: string[],
): Record<string, unknown> {
  let next = mergeClaudeMcpDoc(doc, enabled);
  for (const name of disabledNames) next = removeClaudeMcpServer(next, name);
  return next;
}

export function syncKimiLive(
  doc: unknown,
  enabled: McpServer[],
  disabledNames: string[],
): { servers: McpServer[] } {
  let next = mergeKimiMcpDoc(doc, enabled);
  for (const name of disabledNames) next = removeKimiMcpServer(next, name);
  return next;
}

export function syncCodexLive(
  existing: Record<string, CodexMcpEntry>,
  enabled: McpServer[],
  disabledNames: string[],
): Record<string, CodexMcpEntry> {
  let next = mergeCodexMcpTables(existing, enabled);
  for (const name of disabledNames) next = removeCodexMcpServer(next, name);
  return next;
}

export function syncGrokLive(
  existing: Record<string, CodexMcpEntry>,
  enabled: McpServer[],
  disabledNames: string[],
): Record<string, CodexMcpEntry> {
  let next = mergeGrokMcpTables(existing, enabled);
  for (const name of disabledNames) next = removeGrokMcpServer(next, name);
  return next;
}
