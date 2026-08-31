import { diffLines } from "./diff";
import type { ChatItem, WorkItem } from "./chat";

export type ToolClass = "bash" | "read" | "edit" | "search" | "write" | "other";

export const TOOL_VERB: Record<ToolClass, string> = {
  bash: "运行命令",
  read: "读取",
  edit: "编辑",
  search: "搜索",
  write: "写入",
  other: "调用",
};

const TITLE_PREFIX: Record<ToolClass, RegExp> = {
  bash: /^(?:bash|shell|terminal|exec(?:ute)?|command|运行命令)\s*[:：]?\s*/i,
  read: /^(?:read|cat|读取)\s*[:：]?\s*/i,
  edit: /^(?:edit|str_replace|replace|patch|编辑)\s*[:：]?\s*/i,
  search: /^(?:search|grep|glob|find|rg|搜索|explored?)\s*[:：]?\s*/i,
  write: /^(?:write|create_file|写入)\s*[:：]?\s*/i,
  other: /^(?:tool|call|调用)\s*[:：]?\s*/i,
};

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

export function toolDetailFromTitle(title: string, kind: ToolClass): string {
  const t = title.trim();
  const stripped = t.replace(TITLE_PREFIX[kind], "").trim();
  return stripped || t;
}

/** One-line timeline copy: muted verb + fainter detail. */
export function toolLineCopy(title: string, toolKind?: string): { verb: string; detail: string } {
  const kind = classifyTool(title, toolKind);
  return { verb: TOOL_VERB[kind], detail: toolDetailFromTitle(title, kind) };
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

export type CompressClass = "read" | "call" | "bash" | "edit" | "search";

export type TimelineRow =
  | { kind: "item"; item: WorkItem }
  | { kind: "group"; cls: CompressClass; items: Extract<WorkItem, { kind: "tool" }>[] };

const COMPRESS_VERB: Record<CompressClass, string> = {
  read: TOOL_VERB.read,
  call: TOOL_VERB.other,
  bash: TOOL_VERB.bash,
  edit: TOOL_VERB.edit,
  search: TOOL_VERB.search,
};

export function compressClass(item: WorkItem): CompressClass | null {
  if (item.kind !== "tool") return null;
  const kind = classifyTool(item.title, item.toolKind);
  if (kind === "other") return "call";
  if (kind === "write") return null;
  return kind;
}

export function compressLabel(cls: CompressClass, n: number): string {
  return `${COMPRESS_VERB[cls]} ${n} 次`;
}

/** Consecutive same-class tools collapse to one row when there are two or more. */
export function compressTimeline(items: WorkItem[]): TimelineRow[] {
  const out: TimelineRow[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const cls = compressClass(item);
    if (!cls || item.kind !== "tool") {
      out.push({ kind: "item", item });
      i += 1;
      continue;
    }
    const run: Extract<WorkItem, { kind: "tool" }>[] = [item];
    while (i + run.length < items.length) {
      const next = items[i + run.length];
      if (compressClass(next) !== cls || next.kind !== "tool") break;
      run.push(next);
    }
    if (run.length >= 2) out.push({ kind: "group", cls, items: run });
    else out.push({ kind: "item", item });
    i += run.length;
  }
  return out;
}

/** First `max` lines of tool detail for compact preview. */
export function previewLines(detail?: string, max = 8): string {
  if (!detail) return "";
  const lines = detail.split("\n");
  if (lines.length <= max) return detail;
  return lines.slice(0, max).join("\n");
}

export type BashCommandPreview = {
  full: string;
  preview: string;
  truncated: boolean;
};

/** Strip Execute/Bash prefixes and clip the command to a few list lines. */
export function bashCommandPreview(title: string, maxLines = 4): BashCommandPreview {
  const full = toolDetailFromTitle(title, "bash");
  const preview = previewLines(full, maxLines);
  return { full, preview, truncated: preview !== full };
}
