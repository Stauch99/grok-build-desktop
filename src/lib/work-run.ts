import { isWorkflowToolTitle, type WorkItem } from "./chat";
import { t, type Locale } from "./i18n";
import { classifyTool, toolDetailFromTitle, TOOL_VERB, type ToolClass } from "./tool-render";
import { thoughtDuration } from "./time";
import { WORK_RUN_IDLE, WORK_RUN_VERBS } from "./work-run-copy";

export const LIVE_PHRASE_TICKS = 3;

const KEYWORD_MAX = 4;
const KEYWORD_CHARS = 36;
const KEYWORD_SKIP = new Set([
  "read",
  "edit",
  "write",
  "search",
  "bash",
  "call",
  "tool",
  "读取",
  "编辑",
  "写入",
  "搜索",
  "调用",
  "运行命令",
  "taskupdate",
  "taskcreate",
  "taskget",
  "tasklist",
  "todowrite",
  "todoread",
  "exitplanmode",
]);

const ARIA_VERB: Record<Locale, Record<ToolClass, string>> = {
  zh: TOOL_VERB,
  en: {
    bash: "Running",
    read: "Reading",
    edit: "Editing",
    search: "Searching",
    write: "Writing",
    other: "Calling",
  },
};

export type WorkRunCopy = {
  text: string;
  ariaLabel: string;
  failed: number;
};

export function visibleWorkItems(items: WorkItem[], showThinking: boolean): WorkItem[] {
  return items.filter((item) => {
    if (item.kind === "thought") return showThinking;
    if (item.kind === "tool" && isWorkflowToolTitle(item.title)) return false;
    return true;
  });
}

function toolsOf(items: WorkItem[]): Extract<WorkItem, { kind: "tool" }>[] {
  return items.filter(
    (item): item is Extract<WorkItem, { kind: "tool" }> =>
      item.kind === "tool" && !isWorkflowToolTitle(item.title),
  );
}

function keywordFromTool(item: Extract<WorkItem, { kind: "tool" }>): string | null {
  if (item.status === "pending" || item.status === "in_progress") return null;
  const kind = classifyTool(item.title, item.toolKind);
  const raw = toolDetailFromTitle(item.title, kind).trim();
  if (!raw) return null;
  const base = raw.split(/[/\\]/).filter(Boolean).pop() ?? raw;
  const token = (base.split(/\s+/)[0] ?? base)
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[,，.。;；:：]+$/g, "");
  if (!token) return null;
  if (KEYWORD_SKIP.has(token) || KEYWORD_SKIP.has(token.toLowerCase())) return null;
  return token.length > 18 ? token.slice(0, 18) : token;
}

function clipKeywords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    if (out.length >= KEYWORD_MAX) break;
    const next = [...out, word].join("、");
    if (next.length > KEYWORD_CHARS) break;
    out.push(word);
  }
  return out;
}

function uniqueKeywords(items: WorkItem[]): string[] {
  const found: string[] = [];
  for (const item of toolsOf(items)) {
    const word = keywordFromTool(item);
    if (!word) continue;
    if (found[found.length - 1] === word) continue;
    found.push(word);
  }
  return found;
}

export function workRunKeywords(items: WorkItem[]): string[] {
  return clipKeywords(uniqueKeywords(items));
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickPhrase(list: readonly string[], runId: string, tick: number): string {
  const n = list.length;
  const i = (hashId(runId) + Math.floor(Math.max(0, tick) / LIVE_PHRASE_TICKS)) % n;
  return list[i]!;
}

function usingLabel(n: number, locale: Locale): string {
  return n === 1 ? t(locale, "workRun.usingOne") : t(locale, "workRun.usingN", { n });
}

function joinSettled(using: string, results: string | undefined, locale: Locale): string {
  if (!results) return using;
  return locale === "en" ? `${using}, ${results}` : `${using}，${results}`;
}

function thoughtLabel(items: WorkItem[], locale: Locale): string {
  const thoughts = items.filter((item) => item.kind === "thought");
  const first = thoughts[0];
  const last = thoughts[thoughts.length - 1];
  const duration = thoughtDuration(first?.at, last?.until ?? last?.at);
  if (duration) return t(locale, "workRun.thoughtFor", { d: duration });
  return t(locale, "workRun.thought");
}

function liveTool(items: WorkItem[]): Extract<WorkItem, { kind: "tool" }> | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === "tool" && (item.status === "in_progress" || item.status === "pending")) {
      if (isWorkflowToolTitle(item.title)) continue;
      return item;
    }
  }
  return undefined;
}

function liveIsThinking(items: WorkItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === "tool" && (item.status === "in_progress" || item.status === "pending")) {
      if (isWorkflowToolTitle(item.title)) continue;
      return false;
    }
    if (item?.kind === "thought") return true;
  }
  return false;
}

function failBit(failed: number, locale: Locale): string {
  return failed ? ` · ${t(locale, "workRun.failed", { k: failed })}` : "";
}

function settledCopy(items: WorkItem[], locale: Locale): WorkRunCopy {
  const tools = toolsOf(items);
  const failed = tools.filter((item) => item.status === "failed").length;
  const fail = failBit(failed, locale);
  if (tools.length === 0) {
    const text = `${thoughtLabel(items, locale)}${fail}`;
    return { text, ariaLabel: text, failed };
  }
  const all = uniqueKeywords(items);
  const shown = clipKeywords(all);
  const ellipsis = shown.length < all.length ? "…" : "";
  const results = shown.length
    ? t(locale, "workRun.results", { words: `${shown.join("、")}${ellipsis}` })
    : undefined;
  const text = `${joinSettled(usingLabel(tools.length, locale), results, locale)}${fail}`;
  return { text, ariaLabel: text, failed };
}

function liveCopy(items: WorkItem[], runId: string, tick: number, locale: Locale): WorkRunCopy {
  const failed = toolsOf(items).filter((item) => item.status === "failed").length;
  const fail = failBit(failed, locale);
  const tool = liveTool(items);
  if (tool) {
    const kind = classifyTool(tool.title, tool.toolKind);
    const detail = toolDetailFromTitle(tool.title, kind).trim();
    const verb = pickPhrase(WORK_RUN_VERBS[locale], runId, tick);
    const ariaVerb = ARIA_VERB[locale][kind];
    const text = `${detail ? `${verb} · ${detail}` : verb}${fail}`;
    const ariaLabel = `${t(locale, "workRun.ariaTool", { verb: ariaVerb, detail }).trim()}${fail}`;
    return { text, ariaLabel, failed };
  }
  const idle = pickPhrase(WORK_RUN_IDLE[locale], runId, tick);
  const ariaBase = liveIsThinking(items)
    ? t(locale, "workRun.ariaThinking")
    : t(locale, "workRun.ariaWorking");
  return { text: `${idle}${fail}`, ariaLabel: `${ariaBase}${fail}`, failed };
}

export function workRunCopy(opts: {
  items: WorkItem[];
  busy?: boolean;
  runId?: string;
  tick?: number;
  locale?: Locale;
}): WorkRunCopy {
  const locale = opts.locale ?? "zh";
  if (opts.busy) {
    return liveCopy(opts.items, opts.runId ?? "", opts.tick ?? 0, locale);
  }
  return settledCopy(opts.items, locale);
}
