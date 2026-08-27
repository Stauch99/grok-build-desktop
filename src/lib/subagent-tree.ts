import { subagentStatusFromTool, type SubagentStatus } from "./subagent";
import type { ChatItem } from "./chat";

export function subagentCatalog(
  items: ChatItem[],
): Array<{ id: string; name: string; status: SubagentStatus }> {
  const out: Array<{ id: string; name: string; status: SubagentStatus }> = [];
  for (const it of items) {
    if (it.kind !== "tool") continue;
    const status = subagentStatusFromTool(it.title, it.status);
    if (!status) continue;
    const name = it.title.replace(/spawn_subagent\s*/i, "").trim() || it.title;
    out.push({ id: it.id, name, status });
  }
  return out;
}
