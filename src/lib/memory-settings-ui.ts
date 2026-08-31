import type { AgentId } from "./agent-id";
import { canSaveDreamAgent } from "./memory-settings";

export function nextDreamAgent(id: string, loggedIn: readonly AgentId[]): string | null {
  return canSaveDreamAgent(id, loggedIn) ? id : null;
}
