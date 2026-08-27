export type SessionInfoBits = {
  id: string;
  cwd: string;
  model?: string | null;
  title: string;
  turns: number;
  usage?: { used?: number; size?: number };
};

export function formatSessionInfo(bits: SessionInfoBits): string {
  const usage =
    bits.usage?.size && bits.usage.size > 0
      ? `${bits.usage.used ?? 0}/${bits.usage.size}`
      : "—";
  return [
    `会话 ${bits.title}`,
    `id ${bits.id}`,
    `cwd ${bits.cwd || "—"}`,
    `model ${bits.model || "—"}`,
    `turns ${bits.turns}`,
    `context ${usage}`,
  ].join("\n");
}

export function exportTranscript(
  items: Array<{ kind: string; text?: string; title?: string }>,
): string {
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind === "user" && item.text) lines.push(`## User\n\n${item.text}`);
    else if (item.kind === "assistant" && item.text) lines.push(`## Assistant\n\n${item.text}`);
    else if (item.kind === "tool" && item.title) lines.push(`### Tool · ${item.title}`);
  }
  return lines.join("\n\n");
}

export function lastAssistantText(items: Array<{ kind: string; text?: string }>): string {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.kind === "assistant" && items[i]?.text) return items[i]!.text!;
  }
  return "";
}
