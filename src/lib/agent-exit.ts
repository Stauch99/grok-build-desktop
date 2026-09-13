import type { AgentExitPayload } from "../api";
import { agentChipLabel } from "./agent-chip";
import type { AgentId } from "./agent-id";
import { t, type Locale } from "./i18n";

export type ExitClassification =
  | { kind: "user-stopped"; label: string; shouldWarn: boolean }
  | { kind: "early-crash"; label: string; shouldWarn: boolean }
  | { kind: "clean"; label: string; shouldWarn: boolean }
  | { kind: "crash"; label: string; shouldWarn: boolean };

/**
 * Turns raw exit status into a clear label so the user can tell an intentional
 * restart apart from an auth failure or crash.
 */
export function classifyAgentExit(
  agentId: AgentId,
  payload: AgentExitPayload,
  locale: Locale = "zh",
): ExitClassification {
  const name = agentChipLabel(agentId);
  if (payload && "stopped" in payload) {
    return {
      kind: "user-stopped",
      label: t(locale, "acp.agentExited", { agent: name }),
      shouldWarn: false,
    };
  }
  const code = payload?.code;
  const signal = payload?.signal;
  const uptime = payload?.uptimeMs ?? 0;
  if (uptime > 0 && uptime < 3_000 && code !== 0) {
    return {
      kind: "early-crash",
      label: t(locale, "exit.early", { agent: name, code: code ?? "—" }),
      shouldWarn: true,
    };
  }
  if (code === 0) {
    return {
      kind: "clean",
      label: t(locale, "acp.agentExited", { agent: name }),
      shouldWarn: false,
    };
  }
  const extra =
    code != null
      ? t(locale, "exit.code", { code })
      : signal != null
        ? t(locale, "exit.signal", { signal })
        : "";
  return {
    kind: "crash",
    label: t(locale, "exit.crash", { agent: name, extra }),
    shouldWarn: true,
  };
}
