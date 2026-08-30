import type { AgentId } from "./agent-id";
import type { AuthKind } from "./auth-kind";

export type AgentDoctor = {
  agentId: AgentId;
  binary: string | null;
  version: string | null;
  home: string;
  authPresent: boolean;
  authKind: AuthKind;
  acpSpawnOk: boolean;
  loginHint: string[];
};

export function defaultAgentHome(home: string, id: AgentId): string {
  const root = home.replace(/\/$/, "");
  const folder =
    id === "grok" ? ".grok" : id === "kimi" ? ".kimi-code" : id === "claude" ? ".claude" : ".codex";
  return `${root}/${folder}`;
}

export function defaultLoginHint(_id: AgentId): string[] {
  return ["login"];
}

export function emptyDoctor(id: AgentId, userHome: string): AgentDoctor {
  return {
    agentId: id,
    binary: null,
    version: null,
    home: defaultAgentHome(userHome, id),
    authPresent: false,
    authKind: "none",
    acpSpawnOk: false,
    loginHint: defaultLoginHint(id),
  };
}
