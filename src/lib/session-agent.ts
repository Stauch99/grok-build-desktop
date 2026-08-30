import { isAgentId, type AgentId } from "./agent-id";

export function stampSessionAgent<T extends { id: string; agentId?: string | null }>(
  s: T,
  fallback: AgentId = "grok",
): T & { agentId: AgentId } {
  const agentId = s.agentId && isAgentId(s.agentId) ? s.agentId : fallback;
  return { ...s, agentId };
}

export function agentIdOfSession(s: { agentId?: string | null }): AgentId {
  return stampSessionAgent({ id: "_", agentId: s.agentId }).agentId;
}

/** 打开已有会话：chip 必须跟着走。新建空 composer 才用 chip。 */
export function selectedAgentAfterOpen(
  sessionAgent: AgentId,
  _currentChip: AgentId,
): AgentId {
  return sessionAgent;
}

/** Focus or resume a sidebar row: always sync the chip; skip resume when already bound. */
export function planOpenSession(args: {
  session: { agentId?: string | null };
  alreadyBound: boolean;
  currentChip: AgentId;
}): { selectedAfterOpen: AgentId; resume: boolean } {
  return {
    selectedAfterOpen: selectedAgentAfterOpen(agentIdOfSession(args.session), args.currentChip),
    resume: !args.alreadyBound,
  };
}

export function canChangeSelectedAgent(hasOpenSession: boolean): boolean {
  return !hasOpenSession;
}

export function nextSelectedAgent(
  hasOpenSession: boolean,
  current: AgentId,
  requested: AgentId,
): AgentId {
  return canChangeSelectedAgent(hasOpenSession) ? requested : current;
}

/** Prompt/cancel target: pane session agent, not the chip, once a session is open. */
export function agentIdForPaneDest(args: {
  dest: string;
  extraAgent?: AgentId | null;
  mainAgentId: AgentId;
  chip: AgentId;
  hasOpenMainSession: boolean;
}): AgentId {
  if (args.dest !== "main") {
    return args.extraAgent && isAgentId(args.extraAgent) ? args.extraAgent : args.chip;
  }
  return args.hasOpenMainSession ? args.mainAgentId : args.chip;
}

export function hydrateLastAgent(raw: unknown, fallback: AgentId = "grok"): AgentId {
  return typeof raw === "string" && isAgentId(raw) ? raw : fallback;
}

/** 新对话 must drop the bound session before any CLI call so chips unlock if boot fails. */
export function shouldUnbindBeforeNewChat(): boolean {
  return true;
}

/** Bound 新对话 must cancel the in-flight ACP prompt so the child is not left occupying stdin. */
export function shouldCancelAcpOnNewChat(): boolean {
  return true;
}

export function sessionCancelNotification(sessionId: string): {
  jsonrpc: "2.0";
  method: "session/cancel";
  params: { sessionId: string };
} {
  return { jsonrpc: "2.0", method: "session/cancel", params: { sessionId } };
}

/** First send creates the ACP session; 新对话 must not re-lock the chip row. */
export function shouldCreateAcpSessionOnNewChat(): boolean {
  return false;
}

/** Chip pick starts that CLI so handshake/auth failure is visible before send. */
export function shouldWarmupOnChipSelect(): boolean {
  return true;
}

/** After the user or an open-session chip sync, ignore a late webui hydrate snapshot. */
export function keepLiveAgentOnHydrate(
  userPicked: boolean,
  loaded: unknown,
  current: AgentId,
): AgentId {
  return userPicked ? current : hydrateLastAgent(loaded);
}

/** `_meta.yoloMode` is Grok-only. Other CLIs ignore it or treat unknown meta as a hang risk. */
export function sessionNewMeta(agentId: AgentId, yolo: boolean): Record<string, unknown> {
  return agentId === "grok" && yolo ? { yoloMode: true } : {};
}
