import { agentChipLabel } from "./agent-chip";
import type { AgentId } from "./agent-id";
import type { AuthKind } from "./auth-kind";

export type AgentDoctor = {
  agentId: AgentId;
  binary: string | null;
  version: string | null;
  home: string;
  authPresent: boolean;
  authKind: AuthKind;
  loginHint: string[];
};

export function defaultAgentHome(home: string, id: AgentId): string {
  const root = home.replace(/\/$/, "");
  const folder =
    id === "grok" ? ".grok" : id === "kimi" ? ".kimi-code" : id === "claude" ? ".claude" : ".codex";
  return `${root}/${folder}`;
}

export function defaultLoginHint(id: AgentId): string[] {
  if (id === "grok") return ["grok auth login"];
  if (id === "kimi") return ["kimi login"];
  if (id === "claude") return ["claude auth login"];
  return ["codex login"];
}

export function defaultInstallHint(id: AgentId): string[] {
  if (id === "grok") return ["Install Grok CLI to ~/.grok/bin/grok"];
  if (id === "kimi") return ["Install Kimi Code CLI and put kimi on PATH"];
  if (id === "claude") return ["npm i -g @anthropic-ai/claude-code"];
  return ["npm i -g @openai/codex"];
}

export function doctorActionHint(
  d: Pick<AgentDoctor, "agentId" | "binary" | "authPresent" | "loginHint">,
): string[] {
  if (!d.binary) return defaultInstallHint(d.agentId);
  if (!d.authPresent) return d.loginHint.length ? d.loginHint : defaultLoginHint(d.agentId);
  return [];
}

export function agentSendBlockReason(
  agentId: AgentId,
  doctors: ReadonlyArray<Pick<AgentDoctor, "agentId" | "authPresent" | "binary">>,
): string | null {
  const row = doctors.find((d) => d.agentId === agentId);
  if (!row) return null;
  if (!row.binary) return `${agentChipLabel(agentId)} 未安装`;
  if (!row.authPresent) return `${agentChipLabel(agentId)} 未登录`;
  return null;
}

export function blockedAgentToast(
  agentId: AgentId,
  doctors: ReadonlyArray<Pick<AgentDoctor, "agentId" | "authPresent" | "binary" | "loginHint">>,
): string | null {
  const reason = agentSendBlockReason(agentId, doctors);
  if (!reason) return null;
  const row = doctors.find((d) => d.agentId === agentId);
  const hint = row ? doctorActionHint(row)[0] : undefined;
  return hint ? `${reason} · ${hint}` : reason;
}

export function emptyDoctor(id: AgentId, userHome: string): AgentDoctor {
  return {
    agentId: id,
    binary: null,
    version: null,
    home: defaultAgentHome(userHome, id),
    authPresent: false,
    authKind: "none",
    loginHint: defaultLoginHint(id),
  };
}
