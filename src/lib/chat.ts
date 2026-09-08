import { parseAcpRecord } from "./acp-events";
import type { AgentId } from "./agent-id";
import { stickyToolName } from "./subagent";
import { asRecord, textFromContent, textFromRawOutput } from "./text";
import { parseUsageSplit, type UsageSplit } from "./usage-split";
import { tr } from "./i18n-bridge";

export type { Mode } from "./mode";
export type ToolStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export type DiffBlock = { path: string; oldText?: string | null; newText?: string };

/** Wall-clock metadata carried by every item, from the record's own timestamp. */
export type ItemTime = {
  /** ms since epoch. Absent only for items produced before this was tracked. */
  at?: number;
  /** ms since epoch of the last chunk appended to this item. */
  until?: number;
  /** Which CLI produced this item, when known. */
  agentId?: AgentId;
};

export type ChatItem =
  | ({ kind: "user"; id: string; text: string; model?: string; turn?: number } & ItemTime)
  | ({ kind: "assistant"; id: string; text: string } & ItemTime)
  | ({ kind: "thought"; id: string; text: string } & ItemTime)
  | ({
      kind: "tool";
      id: string;
      title: string;
      toolKind?: string;
      toolName?: string;
      status: ToolStatus;
      detail?: string;
      diff?: DiffBlock;
    } & ItemTime)
  | ({ kind: "plan"; id: string; entries: { content: string; status?: string }[] } & ItemTime)
  | ({ kind: "compact"; id: string; phase: "started" | "completed"; used?: number; size?: number } & ItemTime);

export type PlanEntry = { content: string; status?: string; priority?: string };

export type Artifact = { path: string; kind?: string };

export type SlashCommand = { name: string; hint?: string };

export type ChatState = {
  items: ChatItem[];
  nextId: number;
  usage?: UsageSplit;
  plan: PlanEntry[];
  artifacts: Artifact[];
  commands: SlashCommand[];
};

export type ApplyOptions = {
  skipUser?: boolean;
  /** Clock override for live updates that carry no timestamp. Tests pass this. */
  now?: number;
  /** Disk replay: missing clocks must not glue adjacent user turns. */
  hydrate?: boolean;
  /** Tag new items with the pane's agent. */
  agentId?: AgentId;
};

/** User chunks closer than this belong to one streamed message, not a new turn. */
export const USER_CHUNK_MERGE_MS = 1_500;

const HARNESS_USER_PREFIXES = [
  "<local-command-caveat>",
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<task-notification>",
  "<system-reminder>",
  "<INSTRUCTIONS",
  "<permissions",
  "<multi_agent_mode>",
];

const WORKFLOW_TOOL_TITLES = new Set([
  "taskupdate",
  "taskcreate",
  "taskget",
  "tasklist",
  "todowrite",
  "todoread",
  "exitplanmode",
]);

export function isHarnessUserText(text: string): boolean {
  const t = text.trimStart();
  if (/^\[Request interrupted by user\]\s*$/i.test(t)) return true;
  return HARNESS_USER_PREFIXES.some((prefix) => t.startsWith(prefix));
}

export function isWorkflowToolTitle(title: string): boolean {
  const token = (title.trim().split(/[\s:/]+/)[0] ?? "").toLowerCase();
  return WORKFLOW_TOOL_TITLES.has(token);
}

export function shouldMergeUserChunk(
  last: ChatItem | undefined,
  at: number,
  opts?: { hydrate?: boolean; stamped?: boolean },
): boolean {
  if (last?.kind !== "user") return false;
  if (opts?.hydrate && !opts.stamped) return false;
  const prev = last.until ?? last.at;
  if (prev == null) return !opts?.hydrate;
  return at - prev <= USER_CHUNK_MERGE_MS;
}

export type WorkItem = Extract<ChatItem, { kind: "thought" } | { kind: "tool" }>;

export type ThreadBlock =
  | { kind: "item"; item: ChatItem }
  | { kind: "work"; id: string; items: WorkItem[] };

export function groupWorkRuns(items: ChatItem[]): ThreadBlock[] {
  const out: ThreadBlock[] = [];
  let run: WorkItem[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push({ kind: "work", id: `work-${run[0].id}`, items: run });
    run = [];
  };
  for (const item of items) {
    if (item.kind === "thought" || item.kind === "tool") {
      run.push(item);
    } else {
      flush();
      out.push({ kind: "item", item });
    }
  }
  flush();
  return out;
}

export function workRunLabel(items: WorkItem[]): string {
  const thoughts = items.filter((i) => i.kind === "thought").length;
  const tools = items.filter((i) => i.kind === "tool").length;
  const parts: string[] = [];
  if (thoughts) parts.push(tr("work.thoughts", { n: thoughts }));
  if (tools) parts.push(tr("work.calls", { n: tools }));
  return parts.join(" · ") || tr("work.default");
}

export function workRunMeta(items: WorkItem[]): string | undefined {
  const tools = items.filter((i): i is Extract<WorkItem, { kind: "tool" }> => i.kind === "tool");
  if (tools.some((t) => t.status === "in_progress" || t.status === "pending")) return "in_progress";
  if (tools.some((t) => t.status === "failed")) return "failed";
  if (tools.length && tools.every((t) => t.status === "completed" || t.status === "cancelled")) {
    return "completed";
  }
  return undefined;
}

export function usagePercent(usage?: { used?: number; size?: number }): number | null {
  const size = usage?.size ?? 0;
  if (!size) return null;
  return Math.min(100, Math.max(0, Math.round(((usage?.used || 0) / size) * 100)));
}

export function liveWorkStatus(items: ChatItem[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "tool" && (it.status === "in_progress" || it.status === "pending")) {
      if (isWorkflowToolTitle(it.title)) continue;
      return it.title || it.toolKind || tr("work.calling");
    }
    if (it.kind === "thought") return tr("work.thinking");
    if (it.kind === "assistant" || it.kind === "user") break;
  }
  return tr("work.working");
}

/** Latest user prompt before this item, for retrying a failed tool. */
export function lastUserTextBefore(items: ChatItem[], itemId: string): string | null {
  let last: string | null = null;
  for (const it of items) {
    if (it.id === itemId) break;
    if (it.kind === "user" && it.text.trim()) last = it.text;
  }
  return last;
}

/** Items after the latest user message — the in-flight turn, or empty while waiting. */
export function itemsAfterLastUser(items: ChatItem[]): ChatItem[] {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.kind === "user") return items.slice(i + 1);
  }
  return items;
}

export function turnHasOpenTools(items: ChatItem[]): boolean {
  return itemsAfterLastUser(items).some(
    (it) =>
      it.kind === "tool" &&
      (it.status === "pending" || it.status === "in_progress") &&
      !isWorkflowToolTitle(it.title),
  );
}

/** Some CLIs stream the reply and never send `session/prompt` `stopReason`. */
export const SETTLED_TURN_MS = 4_000;

export function shouldClearBusyOnSettledChat(opts: {
  busy: boolean;
  now: number;
  items: ChatItem[];
  settleMs?: number;
  /** Wall time when assistant text first appeared, if items have no clocks. */
  seenAssistantAt?: number | null;
}): boolean {
  if (!opts.busy) return false;
  const turn = itemsAfterLastUser(opts.items);
  if (turnHasOpenTools(opts.items)) {
    return false;
  }
  if (!turn.some((it) => it.kind === "assistant" && it.text.trim())) return false;
  let last = 0;
  for (const it of turn) {
    if (it.kind === "tool" && isWorkflowToolTitle(it.title)) continue;
    const t = it.until ?? it.at;
    if (typeof t === "number" && t > last) last = t;
  }
  if (!last && opts.seenAssistantAt) last = opts.seenAssistantAt;
  if (!last) return false;
  return opts.now - last >= (opts.settleMs ?? SETTLED_TURN_MS);
}

/** Start of the current turn (after the last user message), for “工作了 …”. */
export function trailingWorkStartedAt(items: ChatItem[]): number | undefined {
  let start: number | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "user") {
      if (start == null) start = it.at;
      break;
    }
    if (it.at != null) start = it.at;
  }
  return start;
}

/**
 * Streaming cursor follows the in-flight assistant turn. Finished turns
 * stay settled even if a later turn is in flight.
 */
export function assistantCopyReady(
  items: ChatItem[],
  itemId: string,
  busy: boolean,
): boolean {
  if (!busy) return true;
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  return items.slice(idx + 1).some((i) => i.kind === "user");
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return tr("elapsed.sec", { n: s });
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? tr("elapsed.minSec", { n: m, s: r }) : tr("elapsed.min", { n: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? tr("elapsed.hourMin", { n: h, m: rest }) : tr("elapsed.hour", { n: h });
}

function usageFromUpdate(
  update: Record<string, unknown>,
  prev?: UsageSplit,
): UsageSplit | undefined {
  const kind = String(update.sessionUpdate ?? "");
  if (kind === "usage_update") {
    const next = parseUsageSplit(update, prev);
    if (
      next.used == null &&
      next.size == null &&
      next.input == null &&
      next.output == null &&
      next.cache == null
    ) {
      return prev;
    }
    return next;
  }
  if (kind === "auto_compact_started") {
    const next = parseUsageSplit(
      { ...update, used: update.tokens_used ?? update.used, size: update.context_window ?? update.size },
      prev,
    );
    if (!next.size) return prev;
    return next;
  }
  if (kind === "auto_compact_completed") {
    const next = parseUsageSplit(
      { ...update, used: update.tokens_after ?? update.used, size: update.context_window ?? update.size },
      prev,
    );
    if (!next.size) return prev;
    return next;
  }
  return undefined;
}

const TOOL_STATUS: ToolStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
];

function asStatus(v: unknown, fallback: ToolStatus): ToolStatus {
  return TOOL_STATUS.includes(v as ToolStatus) ? (v as ToolStatus) : fallback;
}

export function toolLabel(update: Record<string, unknown>, fallback = tr("tool.call")): string {
  const titled = String(update.title ?? "").trim();
  if (titled && titled !== "undefined") return titled;
  const kind = String(update.kind ?? update.toolName ?? "").trim();
  const raw = asRecord(update.rawInput);
  const path = String(raw.target_file ?? raw.path ?? raw.file ?? raw.command ?? "").trim();
  if (kind && path) return `${kind} ${path}`;
  return kind || path || fallback;
}

function extractToolBits(update: Record<string, unknown>): {
  detail?: string;
  diff?: DiffBlock;
} {
  let detail: string | undefined;
  let diff: DiffBlock | undefined;
  if (Array.isArray(update.content)) {
    for (const block of update.content) {
      const b = asRecord(block);
      if (b.type === "diff") {
        diff = {
          path: String(b.path ?? ""),
          oldText: (b.oldText as string | null) ?? null,
          newText: String(b.newText ?? ""),
        };
      } else if (b.type === "content") {
        detail = (detail || "") + textFromContent(b.content);
      } else if (b.type === "text" || b.text != null) {
        detail = (detail || "") + textFromContent(b);
      }
    }
  } else if (update.content) {
    const fromContent = textFromContent(update.content);
    if (fromContent) detail = fromContent;
  }
  if (update.rawOutput) {
    const fromOut = textFromRawOutput(update.rawOutput);
    if (fromOut) detail = fromOut;
  }
  if (update.rawInput && !detail) {
    try {
      detail = JSON.stringify(update.rawInput, null, 2);
    } catch {
      /* ignore */
    }
  }
  return { detail, diff };
}

export function emptyChat(): ChatState {
  return { items: [], nextId: 1, plan: [], artifacts: [], commands: [] };
}

/** Switching the bound session must not keep the previous row's token usage. */
export function chatAfterBoundSessionChange(
  chat: ChatState,
  prevId: string | null,
  nextId: string | null,
): ChatState {
  if (prevId === nextId || !chat.usage) return chat;
  return { ...chat, usage: undefined };
}

export function applyChatUpdate(
  state: ChatState,
  params: Record<string, unknown>,
  opts: ApplyOptions = {},
): ChatState {
  const update = params.update ? asRecord(params.update) : params;
  const kind = String(update.sessionUpdate ?? "");
  // Rust injects `_ts` from the record's own timestamp when replaying from
  // disk; a live notification has none, so it happened just now.
  const rawTs = params._ts;
  let stamped = false;
  let at = opts.now ?? Date.now();
  if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
    stamped = true;
    at = rawTs;
  }
  const mergeOpts = { hydrate: opts.hydrate, stamped };
  const meta = asRecord(update._meta);
  let nextId = state.nextId;
  const nid = (prefix: string) => {
    nextId += 1;
    return `${prefix}-${nextId}`;
  };

  switch (kind) {
    case "user_message_chunk": {
      if (opts.skipUser) return state;
      const text = textFromContent(update.content);
      if (!text || isHarnessUserText(text)) return state;
      const items = [...state.items];
      const last = items[items.length - 1];
      const model = typeof meta.modelId === "string" ? meta.modelId : undefined;
      const turn = typeof meta.promptIndex === "number" ? meta.promptIndex : undefined;
      if (last?.kind === "user" && last.text === text && shouldMergeUserChunk(last, at, mergeOpts)) {
        return state;
      }
      if (last?.kind === "user" && shouldMergeUserChunk(last, at, mergeOpts)) {
        items[items.length - 1] = { ...last, text: last.text + text, until: at };
      } else {
        items.push({ kind: "user", id: nid("u"), text, model, turn, at, until: at, agentId: opts.agentId });
      }
      return { ...state, items, nextId };
    }
    case "agent_message_chunk": {
      const text = textFromContent(update.content);
      if (!text) return state;
      const items = [...state.items];
      const last = items[items.length - 1];
      if (last?.kind === "assistant") {
        items[items.length - 1] = { ...last, text: last.text + text, until: at };
      } else {
        items.push({ kind: "assistant", id: nid("a"), text, at, until: at, agentId: opts.agentId });
      }
      return { ...state, items, nextId };
    }
    case "agent_thought_chunk": {
      const text = textFromContent(update.content);
      if (!text) return state;
      const items = [...state.items];
      const last = items[items.length - 1];
      if (last?.kind === "thought") {
        items[items.length - 1] = { ...last, text: last.text + text, until: at };
      } else {
        items.push({ kind: "thought", id: nid("t"), text, at, until: at, agentId: opts.agentId });
      }
      return { ...state, items, nextId };
    }
    case "tool_call":
    case "tool_call_update": {
      const id = String(update.toolCallId ?? nid("tool"));
      const { detail, diff } = extractToolBits(update);
      const items = [...state.items];
      const idx = items.findIndex((it) => it.kind === "tool" && it.id === id);
      if (idx >= 0) {
        const cur = items[idx];
        if (cur.kind === "tool") {
          const title = toolLabel(update, cur.title);
          items[idx] = {
            ...cur,
            title,
            toolName: stickyToolName(cur.toolName, String(update.title ?? "")),
            toolKind: String(update.kind ?? cur.toolKind ?? ""),
            status: asStatus(update.status, cur.status),
            detail: detail ?? cur.detail,
            diff: diff ?? cur.diff,
            until: at,
          };
        }
      } else {
        const title = toolLabel(update);
        items.push({
          kind: "tool",
          id,
          title,
          toolName: stickyToolName(undefined, String(update.title ?? title)),
          toolKind: String(update.kind ?? ""),
          status: asStatus(update.status, "pending"),
          detail,
          diff,
          at,
          until: at,
          agentId: opts.agentId,
        });
      }
      const artifacts = mergeArtifacts(state.artifacts, update, diff);
      return { ...state, items, nextId, artifacts };
    }
    case "plan": {
      const entries = Array.isArray(update.entries)
        ? (update.entries as PlanEntry[])
        : [];
      return { ...state, nextId, plan: entries };
    }
    case "available_commands": {
      const raw = Array.isArray(update.commands) ? update.commands : [];
      const commands = raw.map((c) => {
        const rec = asRecord(c);
        return { name: String(rec.name ?? rec.command ?? ""), hint: String(rec.hint ?? rec.description ?? "") };
      }).filter((c) => c.name);
      return { ...state, nextId, commands };
    }
    default: {
      const usage = usageFromUpdate(update, state.usage);
      if (usage) {
        if (kind === "auto_compact_started" || kind === "auto_compact_completed") {
          const phase: "started" | "completed" = kind === "auto_compact_started" ? "started" : "completed";
          const items = [
            ...state.items,
            {
              kind: "compact" as const,
              id: nid("compact"),
              phase,
              used: usage.used,
              size: usage.size,
              at,
              until: at,
              agentId: opts.agentId,
            },
          ];
          return { ...state, items, nextId, usage };
        }
        return { ...state, nextId, usage };
      }
      return state;
    }
  }
}

function mergeArtifacts(prev: Artifact[], update: Record<string, unknown>, diff?: DiffBlock): Artifact[] {
  const next = [...prev];
  const add = (path: string, kind?: string) => {
    if (!path) return;
    if (!next.some((a) => a.path === path)) next.push({ path, kind });
  };
  if (diff?.path) add(diff.path, "edit");
  if (Array.isArray(update.locations)) {
    for (const loc of update.locations) {
      const rec = asRecord(loc);
      add(String(rec.path ?? ""), String(update.kind ?? "file"));
    }
  }
  return next.slice(-40);
}

export function latestPlan(state: ChatState): PlanEntry[] {
  return state.plan;
}

export function hydrateFromUpdates(rows: unknown[], prev?: ChatState): ChatState {
  let state = prev ?? emptyChat();
  for (const row of rows) {
    const rec = parseAcpRecord(row);
    if (!rec) continue;
    const params = rec.params ? asRecord(rec.params) : rec;
    state = applyChatUpdate(state, params, { hydrate: true });
  }
  return state;
}

export type SessionUpdatePage = {
  rows: unknown[];
  nextByte: number;
  truncated: boolean;
};

export type SessionUpdateCursor = {
  nextByte: number;
  chat: ChatState;
};

export function afterByteFor(
  cursors: Map<string, SessionUpdateCursor>,
  sessionId: string,
): number | undefined {
  return cursors.get(sessionId)?.nextByte;
}

export function applySessionPage(
  cursors: Map<string, SessionUpdateCursor>,
  sessionId: string,
  page: SessionUpdatePage,
): ChatState {
  const prev = cursors.get(sessionId)?.chat;
  const chat = hydrateFromUpdates(page.rows, prev);
  cursors.set(sessionId, { nextByte: page.nextByte, chat });
  return chat;
}

export function shouldKeepSessionUpdate(
  currentId: string | null,
  incomingId: string | null,
): boolean {
  if (!currentId) return false;
  if (!incomingId) return true;
  return incomingId === currentId;
}
