import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { acpMessageFromEvent } from "./acp-host";
import type { AgentId } from "./agent-id";
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

export function onTaggedAcpRequest(
  handler: (agentId: AgentId, msg: unknown) => void,
): Promise<import("@tauri-apps/api/event").UnlistenFn> {
  return listen("acp-request", (e) => {
    const tagged = acpMessageFromEvent(e.payload);
    handler(tagged.agentId, tagged.payload);
  });
}
