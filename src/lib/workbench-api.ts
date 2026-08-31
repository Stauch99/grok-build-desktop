import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { acpMessageFromEvent } from "./acp-host";
import type { AgentId } from "./agent-id";
import type { AgentDoctor } from "./agent-doctor";
import type { AgentModelSource } from "./agent-models";
import { parseMcpJson, stringifyMcpJson, type McpServer } from "./agents-store";
import { nextClaudeLiveText, nextKimiLiveText } from "./mcp-hub-sync";
import { removeMcpCatalog, upsertMcpCatalog } from "./mcp-live-paths";

export async function doctorAll(): Promise<AgentDoctor[]> {
  return invoke("doctor_all");
}

export async function readAgentModelSource(agentId: AgentId): Promise<AgentModelSource> {
  return invoke("read_agent_model_source", { agentId });
}

export async function patchAgentModelSettings(
  agentId: AgentId,
  patch: { model?: string; effort?: string },
): Promise<{ ok: boolean }> {
  return invoke("patch_agent_model_settings", { agentId, patch });
}

export async function installMarketplaceSkill(source: string): Promise<string> {
  return invoke("install_marketplace_skill", { source });
}

export async function syncAgentSkill(name: string, enabled: Record<string, boolean>): Promise<[string, string][]> {
  return invoke("sync_agent_skill", { name, enabled: Object.entries(enabled) });
}

export async function importAgentsMcpFirstOpen(): Promise<string[]> {
  return invoke("import_agents_mcp_first_open");
}

export async function readAgentsFile(kind: string): Promise<string> {
  return invoke("read_agents_file", { kind });
}

export async function writeAgentsFile(kind: string, text: string): Promise<void> {
  return invoke("write_agents_file", { kind, text });
}

export async function upsertTomlMcp(
  kind: "grok-toml" | "codex-toml",
  name: string,
  command: string,
  args: string[],
): Promise<void> {
  return invoke("upsert_toml_mcp", { kind, name, command, args });
}

export async function removeTomlMcp(kind: "grok-toml" | "codex-toml", name: string): Promise<void> {
  return invoke("remove_toml_mcp", { kind, name });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export async function syncHubMcpServer(server: McpServer): Promise<void> {
  const raw = await readAgentsFile("mcp-json");
  const catalog = upsertMcpCatalog(parseMcpJson(safeJson(raw)), server);
  await writeAgentsFile("mcp-json", stringifyMcpJson(catalog));
  await writeAgentsFile("claude-json", nextClaudeLiveText(await readAgentsFile("claude-json"), [server], []));
  await writeAgentsFile("kimi-mcp", nextKimiLiveText(await readAgentsFile("kimi-mcp"), [server], []));
  const cmd = server.commandOrUrl ?? "";
  await upsertTomlMcp("grok-toml", server.name, cmd, server.args ?? []);
  await upsertTomlMcp("codex-toml", server.name, cmd, server.args ?? []);
}

export async function removeHubMcpServer(name: string): Promise<void> {
  const catalog = removeMcpCatalog(parseMcpJson(safeJson(await readAgentsFile("mcp-json"))), name);
  await writeAgentsFile("mcp-json", stringifyMcpJson(catalog));
  await stripHubMcpFromLives(name);
}

export async function disableHubMcpServer(name: string): Promise<void> {
  await stripHubMcpFromLives(name);
}

export async function enableHubMcpServer(name: string): Promise<void> {
  const catalog = parseMcpJson(safeJson(await readAgentsFile("mcp-json")));
  const server = catalog.find((row) => row.name === name);
  if (!server) return;
  await syncHubMcpServer(server);
}

async function stripHubMcpFromLives(name: string): Promise<void> {
  await writeAgentsFile("claude-json", nextClaudeLiveText(await readAgentsFile("claude-json"), [], [name]));
  await writeAgentsFile("kimi-mcp", nextKimiLiveText(await readAgentsFile("kimi-mcp"), [], [name]));
  await removeTomlMcp("grok-toml", name);
  await removeTomlMcp("codex-toml", name);
}

export function onTaggedAcpRequest(
  handler: (agentId: AgentId, msg: unknown) => void,
): Promise<import("@tauri-apps/api/event").UnlistenFn> {
  return listen("acp-request", (e) => {
    const tagged = acpMessageFromEvent(e.payload);
    handler(tagged.agentId, tagged.payload);
  });
}
