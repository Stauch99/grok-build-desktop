import { subagentStatusFromItem } from "./subagent";
import type { ChatItem } from "./chat";

export function headerJobs(items: ChatItem[]): Array<{ id: string; title: string; status: string }> {
  return items
    .filter((it): it is Extract<ChatItem, { kind: "tool" }> => it.kind === "tool")
    .filter((it) => it.status === "in_progress" || it.status === "pending")
    .filter((it) => !subagentStatusFromItem(it))
    .map((it) => ({ id: it.id, title: it.title, status: it.status }));
}
