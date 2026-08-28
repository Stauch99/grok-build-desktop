import { parseAcpRecord } from "./acp-events";
import { asRecord, textFromContent } from "./text";
import { parseUsageSplit, type UsageSplit } from "./usage-split";

export type { Mode } from "./mode";
export type ToolStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export type DiffBlock = { path: string; oldText?: string | null; newText?: string };

/** Wall-clock metadata carried by every item, from the record's own timestamp. */
export type ItemTime = {
  /** ms since epoch. Absent only for items produced before this was tracked. */
  at?: number;
  /** ms since epoch of the last chunk appended to this item. */
  until?: number;
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
};

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
  if (thoughts) parts.push(`${thoughts} 段思考`);
  if (tools) parts.push(`${tools} 次调用`);
  return parts.join(" · ") || "工作";
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
      return it.title || it.toolKind || "调用中";
    }
    if (it.kind === "thought") return "思考中";
    if (it.kind === "assistant" || it.kind === "user") break;
  }
  return "工作中";
}

/** Start of the current turn (after the last user message), for “工作了 …”. */
export function trailingWorkStartedAt(items: ChatItem[]): number | undefined {
  let start: number | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "user") break;
    if (it.at != null) start = it.at;
  }
  return start;
}

/**
 * Copy sits under an assistant bubble. Hide it while that turn is still
 * streaming — otherwise the button wedges itself between later chunks.
 * Finished turns keep the control even if a later turn is in flight.
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
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}分${r}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}小时${rest}分` : `${h}小时`;
}

function usageFromUpdate(
  update: Record<string, unknown>,
  prev?: UsageSplit,
): UsageSplit | undefined {
  const kind = String(update.sessionUpdate ?? "");
  if (kind === "usage_update") {
    const next = parseUsageSplit(update, prev);
    if (!next.size) return prev;
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

export function toolLabel(update: Record<string, unknown>, fallback = "工具调用"): string {
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
      }
    }
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

export function applyChatUpdate(
  state: ChatState,
  params: Record<string, unknown>,
  opts: ApplyOptions = {},
): ChatState {
  const update = params.update ? asRecord(params.update) : params;
  const kind = String(update.sessionUpdate ?? "");
  // Rust injects `_ts` from the record's own timestamp when replaying from
  // disk; a live notification has none, so it happened just now.
  const at = typeof params._ts === "number" && Number.isFinite(params._ts)
    ? params._ts
    : opts.now ?? Date.now();
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
      if (!text) return state;
      const items = [...state.items];
      const last = items[items.length - 1];
      const model = typeof meta.modelId === "string" ? meta.modelId : undefined;
      const turn = typeof meta.promptIndex === "number" ? meta.promptIndex : undefined;
      if (last?.kind === "user") {
        items[items.length - 1] = { ...last, text: last.text + text, until: at };
      } else {
        items.push({ kind: "user", id: nid("u"), text, model, turn, at, until: at });
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
        items.push({ kind: "assistant", id: nid("a"), text, at, until: at });
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
        items.push({ kind: "thought", id: nid("t"), text, at, until: at });
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
          items[idx] = {
            ...cur,
            title: toolLabel(update, cur.title),
            toolKind: String(update.kind ?? cur.toolKind ?? ""),
            status: asStatus(update.status, cur.status),
            detail: detail ?? cur.detail,
            diff: diff ?? cur.diff,
            until: at,
          };
        }
      } else {
        items.push({
          kind: "tool",
          id,
          title: toolLabel(update),
          toolKind: String(update.kind ?? ""),
          status: asStatus(update.status, "pending"),
          detail,
          diff,
          at,
          until: at,
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

export function hydrateFromUpdates(rows: unknown[]): ChatState {
  let state = emptyChat();
  for (const row of rows) {
    const rec = parseAcpRecord(row);
    if (!rec) continue;
    const params = rec.params ? asRecord(rec.params) : rec;
    state = applyChatUpdate(state, params);
  }
  return state;
}

export function shouldKeepSessionUpdate(
  currentId: string | null,
  incomingId: string | null,
): boolean {
  if (!incomingId || !currentId) return true;
  return incomingId === currentId;
}
