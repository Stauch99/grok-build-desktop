import type { AgentId } from "./agent-id";

export type AgentProfile = {
  id: AgentId;
  label: string;
  command: string;
  args: string[];
  loginArgs: string[];
};

export function defaultProfile(id: AgentId): AgentProfile {
  switch (id) {
    case "grok":
      return { id, label: "Grok", command: "grok", args: ["agent", "stdio"], loginArgs: ["login"] };
    case "kimi":
      return { id, label: "Kimi", command: "kimi", args: ["acp"], loginArgs: ["login"] };
    case "claude":
      return {
        id,
        label: "Claude",
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp@0.70.0"],
        loginArgs: ["login"],
      };
    case "codex":
      return {
        id,
        label: "Codex",
        command: "npx",
        args: ["-y", "@agentclientprotocol/codex-acp@1.7.0"],
        loginArgs: ["login"],
      };
  }
}

export function defaultProfiles(): Record<AgentId, AgentProfile> {
  return {
    grok: defaultProfile("grok"),
    kimi: defaultProfile("kimi"),
    claude: defaultProfile("claude"),
    codex: defaultProfile("codex"),
  };
}
