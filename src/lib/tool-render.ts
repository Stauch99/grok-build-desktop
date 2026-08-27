import { diffLines } from "./diff";
import type { ChatItem } from "./chat";

export type ToolClass = "bash" | "read" | "edit" | "search" | "write" | "other";

/** Map ACP tool title/kind to a compact UI class label. */
export function classifyTool(title: string, toolKind?: string): ToolClass {
  const kind = (toolKind ?? "").toLowerCase().trim();
  const blob = `${kind} ${title}`.toLowerCase();

  if (
    kind === "execute" ||
    kind === "bash" ||
    kind === "shell" ||
    /\b(bash|shell|terminal|exec|command)\b/.test(blob)
  ) {
    return "bash";
  }
  if (kind === "read" || /\bread\b/.test(blob) || /\bcat\b/.test(blob)) {
    return "read";
  }
  if (
    kind === "edit" ||
    /\b(edit|str_replace|replace|patch|apply_diff)\b/.test(blob)
  ) {
    return "edit";
  }
  if (
    kind === "search" ||
    /\b(search|grep|glob|find|rg)\b/.test(blob)
  ) {
    return "search";
  }
  if (kind === "write" || /\bwrite\b/.test(blob) || /\bcreate_file\b/.test(blob)) {
    return "write";
  }
  return "other";
}

export function bashTools(items: ChatItem[]): Extract<ChatItem, { kind: "tool" }>[] {
  return items.filter((item): item is Extract<ChatItem, { kind: "tool" }> =>
    item.kind === "tool" && classifyTool(item.title, item.toolKind) === "bash",
  );
}

/** Fold-head suffix like `+3 −1`. Empty when the tool did not carry a diff. */
export function diffStatLabel(diff?: {
  oldText?: string | null;
  newText?: string;
}): string | undefined {
  if (!diff) return undefined;
  const result = diffLines(diff.oldText, diff.newText ?? "");
  const parts: string[] = [];
  if (result.added) parts.push(`+${result.added}`);
  if (result.removed) parts.push(`−${result.removed}`);
  return parts.length ? parts.join(" ") : undefined;
}

/** First `max` lines of tool detail for compact preview. */
export function previewLines(detail?: string, max = 8): string {
  if (!detail) return "";
  const lines = detail.split("\n");
  if (lines.length <= max) return detail;
  return lines.slice(0, max).join("\n");
}
