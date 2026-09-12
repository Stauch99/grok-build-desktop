import { isSubagentPollTool, subagentStatusFromItem } from "./subagent";
import type { ChatItem } from "./chat";
import { MAIN_PANE } from "./pane-tree";

export type HeaderJob = {
  id: string;
  title: string;
  status: string;
  paneId: string;
  sessionId: string | null;
};

export type HeaderJobPane = {
  paneId: string;
  sessionId: string | null;
};

const DEFAULT_PANE: HeaderJobPane = { paneId: MAIN_PANE, sessionId: null };

function isLiveTool(it: ChatItem): it is Extract<ChatItem, { kind: "tool" }> {
  return it.kind === "tool" && (it.status === "in_progress" || it.status === "pending");
}

function isBackgroundJobTitle(title: string): boolean {
  return /\[bg\]/i.test(title);
}

function toJob(it: Extract<ChatItem, { kind: "tool" }>, pane: HeaderJobPane): HeaderJob {
  return { id: it.id, title: it.title, status: it.status, paneId: pane.paneId, sessionId: pane.sessionId };
}

export function headerJobs(items: ChatItem[], pane: HeaderJobPane = DEFAULT_PANE): HeaderJob[] {
  const live = items.filter(isLiveTool).filter((it) => !subagentStatusFromItem(it));
  const real = live.filter((it) => !isSubagentPollTool(it.title, it.toolName));
  if (real.length > 0) return real.map((it) => toJob(it, pane));
  return live.filter((it) => isBackgroundJobTitle(it.title)).map((it) => toJob(it, pane));
}

export function windowJobs(
  panes: Array<HeaderJobPane & { items: ChatItem[] }>,
): HeaderJob[] {
  return panes.flatMap((pane) => headerJobs(pane.items, pane));
}
