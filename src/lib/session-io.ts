import type { ChatItem } from "./chat";
import { summarizeThread } from "./session-summary";

export type SessionExport = {
  summary: string;
  items: ChatItem[];
};

export type SessionImportResult =
  | { ok: true; value: SessionExport }
  | { ok: false; error: string };

const ITEM_KINDS = new Set(["user", "assistant", "thought", "tool", "plan", "compact"]);

export function buildSessionExport(items: ChatItem[]): SessionExport {
  return { summary: summarizeThread(items), items };
}

export function sessionToJson(exp: SessionExport): string {
  return JSON.stringify({ summary: exp.summary, items: exp.items }, null, 2);
}

export function sessionToMarkdown(exp: SessionExport): string {
  const lines = ["# 对话回顾", "", exp.summary || "（无摘要）", ""];
  for (const item of exp.items) {
    if (item.kind === "user") {
      lines.push("## 用户", "", item.text, "");
    } else if (item.kind === "assistant") {
      lines.push("## 助手", "", item.text, "");
    } else if (item.kind === "thought") {
      lines.push("### 思考", "", item.text, "");
    } else if (item.kind === "tool") {
      lines.push(`### 工具 · ${item.title}`, "");
    } else if (item.kind === "plan") {
      lines.push("### 计划", "", ...item.entries.map((e) => `- ${e.content}`), "");
    }
  }
  return lines.join("\n").trim() + "\n";
}

function isChatItem(value: unknown): value is ChatItem {
  if (!value || typeof value !== "object") return false;
  const item = value as { kind?: unknown; id?: unknown; text?: unknown; title?: unknown; entries?: unknown; phase?: unknown };
  if (typeof item.kind !== "string" || !ITEM_KINDS.has(item.kind)) return false;
  if (typeof item.id !== "string" || !item.id) return false;
  if (item.kind === "user" || item.kind === "assistant" || item.kind === "thought") {
    return typeof item.text === "string";
  }
  if (item.kind === "tool") return typeof item.title === "string";
  if (item.kind === "plan") return Array.isArray(item.entries);
  if (item.kind === "compact") return item.phase === "started" || item.phase === "completed";
  return false;
}

export function parseSessionImport(raw: string): SessionImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "不是有效的 JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "导入内容必须是对象" };
  }
  const rec = parsed as { summary?: unknown; items?: unknown };
  if (!Array.isArray(rec.items)) {
    return { ok: false, error: "缺少 items 数组" };
  }
  const items = rec.items.filter(isChatItem);
  if (items.length === 0) {
    return { ok: false, error: "没有可导入的对话条目" };
  }
  const summary = typeof rec.summary === "string" ? rec.summary : summarizeThread(items);
  return { ok: true, value: { summary, items } };
}

/** Shallow copy so imported transcripts stay local / view-only. */
export function viewOnlyItems(items: ChatItem[]): ChatItem[] {
  return items.map((item) => ({ ...item }));
}

export function exportFilename(kind: "md" | "json", title?: string): string {
  const raw = (title ?? "").replace(/\s+/g, " ").trim();
  if (!raw || /[\\/:*?"<>|]/.test(raw)) return `session.${kind}`;
  return `${raw.slice(0, 60)}.${kind}`;
}

export function downloadText(filename: string, body: string, mime: string): void {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSessionFile(items: ChatItem[], kind: "md" | "json", title?: string): void {
  const exp = buildSessionExport(items);
  const body = kind === "md" ? sessionToMarkdown(exp) : sessionToJson(exp);
  const mime = kind === "md" ? "text/markdown" : "application/json";
  downloadText(exportFilename(kind, title), body, mime);
}
