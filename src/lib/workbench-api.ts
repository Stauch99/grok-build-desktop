import { invoke } from "@tauri-apps/api/core";
import type { AgentDoctor } from "./agent-doctor";

export async function doctorAll(): Promise<AgentDoctor[]> {
  return invoke("doctor_all");
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
