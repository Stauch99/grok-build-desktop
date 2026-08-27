export type AgentHealth = "ok" | "connecting" | "disconnected" | "idle";

export const GROK_LOGIN_CMD = "grok login";

export function agentHealth(opts: {
  ready: boolean;
  connecting: boolean;
  sawExit: boolean;
}): AgentHealth {
  if (opts.ready) return "ok";
  if (opts.connecting) return "connecting";
  if (opts.sawExit) return "disconnected";
  return "idle";
}
