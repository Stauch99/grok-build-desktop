import type { ChatState } from "../lib/chat";
import type { AgentId } from "../lib/agent-id";
import type { QueueState } from "../lib/prompt-queue";
import { applyTurnCrash, turnIsLive } from "../lib/turn-crash";
import { shouldClearBusyOnAgentStderr, surfaceStderr } from "../lib/text";
import { shouldDropAcpEvent } from "../lib/acp-host";
import { agentChipLabel } from "../lib/agent-chip";
import { MAIN_PANE } from "../lib/pane-tree";
import { t } from "../lib/i18n";
import { withPromptFail } from "./acp-session-rpc";

export function paneAgentForEvent(
  dest: string,
  mainAgent: AgentId,
  extraAgent?: AgentId | null,
): AgentId {
  if (dest === MAIN_PANE || dest === "main") return mainAgent;
  return extraAgent ?? mainAgent;
}

export function shouldIgnoreAcpEvent(
  paneAgent: AgentId,
  eventAgent: AgentId | undefined,
): boolean {
  if (eventAgent == null) return false;
  return shouldDropAcpEvent(paneAgent, eventAgent);
}

/** After onAgentExit marks the CLI not ready, leftover session/update must not resurrect tools. */
export function shouldDropUpdateAfterAgentExit(
  ready: Readonly<Partial<Record<AgentId, boolean>>>,
  eventAgent: AgentId | undefined,
): boolean {
  if (eventAgent == null) return false;
  return ready[eventAgent] === false;
}

export function stderrToastText(eventAgent: AgentId, line: string): string | null {
  const msg = surfaceStderr(line);
  if (!msg) return null;
  return `${agentChipLabel(eventAgent)} · ${msg}`;
}

export function agentExitToastText(eventAgent: AgentId): string {
  return t("zh", "acp.agentExited", { agent: agentChipLabel(eventAgent) });
}

export function extraPanesHitAgent(
  panes: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
): boolean {
  return Object.values(panes).some((pane) => pane.agentId === eventAgent);
}

export function extraPanesAfterAgentExit(
  prev: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
  crash: { detail: string; at: number },
  liveChats?: Readonly<Record<string, ChatState>>,
): Record<string, ExtraPaneState> {
  let changed = false;
  const next: Record<string, ExtraPaneState> = {};
  for (const [id, pane] of Object.entries(prev)) {
    const chat = liveChats?.[id] ?? pane.chat;
    if (pane.agentId === eventAgent && turnIsLive(chat, pane.busy)) {
      next[id] = {
        ...pane,
        busy: false,
        chat: applyTurnCrash(chat, { busy: pane.busy, detail: crash.detail, at: crash.at }),
      };
      changed = true;
    } else {
      next[id] = pane;
    }
  }
  return changed ? next : prev;
}

export function extraPanesAfterAgentStderr(
  prev: Record<string, ExtraPaneState>,
  eventAgent: AgentId,
  line: string,
  now: number,
): Record<string, ExtraPaneState> {
  if (!shouldClearBusyOnAgentStderr(line)) return prev;
  const notice = surfaceStderr(line);
  let changed = false;
  const next: Record<string, ExtraPaneState> = {};
  for (const [id, pane] of Object.entries(prev)) {
    if (shouldIgnoreAcpEvent(pane.agentId, eventAgent)) {
      next[id] = pane;
      continue;
    }
    next[id] = {
      ...pane,
      chat: notice ? withPromptFail(pane.chat, notice, now) : pane.chat,
    };
    changed = true;
  }
  return changed ? next : prev;
}

export type ExtraPaneState = {
  sessionId: string;
  cwd: string;
  chat: ChatState;
  draft: string;
  busy: boolean;
  atBottom: boolean;
  queue: QueueState;
  agentId: AgentId;
};

export type AcpSplitState = ExtraPaneState;

export type PaneDest = string;
