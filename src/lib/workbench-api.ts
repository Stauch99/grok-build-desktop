import { invoke } from "@tauri-apps/api/core";
import type { AgentDoctor } from "./agent-doctor";

export async function doctorAll(): Promise<AgentDoctor[]> {
  return invoke("doctor_all");
}

export async function installMarketplaceSkill(source: string): Promise<string> {
  return invoke("install_marketplace_skill", { source });
}
