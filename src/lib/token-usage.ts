import { isAgentId, type AgentId } from "./agent-id";

export const USD_TICKS = 10_000_000_000;

export type TokenTurn = {
  at: number;
  cwd: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
  modelCalls: number;
  costTicks: number;
  agentId?: AgentId;
};

export type UsageSummary = {
  total: number;
  input: number;
  newInput: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  requests: number;
  modelCalls: number;
  costTicks: number;
};

export type TurnFilter = {
  days: 0 | 7 | 30;
  now?: number;
  model?: string;
  cwd?: string;
  agentId?: AgentId | "all";
};

export type UsageBrandFilter = AgentId | "all";

export const USAGE_BRAND_OPTIONS: { value: UsageBrandFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "grok", label: "Grok" },
  { value: "kimi", label: "Kimi" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

export function mapTokenTurnRow(row: {
  at?: unknown;
  cwd?: unknown;
  model?: unknown;
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheCreate?: unknown;
  total?: unknown;
  modelCalls?: unknown;
  costTicks?: unknown;
  agentId?: unknown;
}): TokenTurn {
  const agentId = typeof row.agentId === "string" && isAgentId(row.agentId) ? row.agentId : undefined;
  return {
    at: Number(row.at) || 0,
    cwd: typeof row.cwd === "string" ? row.cwd : "",
    model: typeof row.model === "string" ? row.model : "",
    input: Number(row.input) || 0,
    output: Number(row.output) || 0,
    cacheRead: Number(row.cacheRead) || 0,
    cacheCreate: Number(row.cacheCreate) || 0,
    total: Number(row.total) || 0,
    modelCalls: Number(row.modelCalls) || 0,
    costTicks: Number(row.costTicks) || 0,
    ...(agentId ? { agentId } : {}),
  };
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Math.max(0, Number(v));
  return 0;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseTurnUsage(
  update: Record<string, unknown>,
  meta?: { at?: number; cwd?: string; agentId?: AgentId },
): TokenTurn | null {
  if (String(update.sessionUpdate ?? "") !== "turn_completed") return null;
  const usage = asRecord(update.usage);
  if (!usage) return null;
  const input = num(usage.inputTokens ?? usage.input_tokens);
  const output = num(usage.outputTokens ?? usage.output_tokens);
  const cacheRead = num(usage.cachedReadTokens ?? usage.cache_read_input_tokens ?? usage.cacheReadInputTokens);
  const cacheCreate = num(usage.cacheCreationTokens ?? usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens);
  const total = num(usage.totalTokens ?? usage.total_tokens) || input + output;
  if (input <= 0 && output <= 0 && cacheRead <= 0 && total <= 0) return null;
  const models = asRecord(usage.modelUsage);
  const model = models ? Object.keys(models)[0] ?? "" : "";
  return {
    at: meta?.at ?? 0,
    cwd: meta?.cwd ?? "",
    model,
    input,
    output,
    cacheRead,
    cacheCreate,
    total,
    modelCalls: num(usage.modelCalls ?? usage.numTurns),
    costTicks: num(usage.costUsdTicks ?? usage.total_cost_usd_ticks),
    ...(meta?.agentId ? { agentId: meta.agentId } : {}),
  };
}

export function uncachedInput(t: Pick<TokenTurn, "input" | "cacheRead" | "cacheCreate">): number {
  return Math.max(0, t.input - t.cacheRead - t.cacheCreate);
}

export function filterTurns(turns: TokenTurn[], opts: TurnFilter): TokenTurn[] {
  const now = opts.now ?? Date.now();
  const from = opts.days > 0 ? now - opts.days * 24 * 60 * 60 * 1000 : 0;
  return turns.filter((row) => {
    if (opts.days > 0 && row.at < from) return false;
    if (opts.model && row.model !== opts.model) return false;
    if (opts.cwd && row.cwd !== opts.cwd) return false;
    const brand = row.agentId ?? "grok";
    if (opts.agentId && opts.agentId !== "all" && brand !== opts.agentId) return false;
    return true;
  });
}

export function summarizeTurns(turns: TokenTurn[]): UsageSummary {
  const next: UsageSummary = {
    total: 0,
    input: 0,
    newInput: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate: 0,
    requests: turns.length,
    modelCalls: 0,
    costTicks: 0,
  };
  for (const row of turns) {
    next.total += row.total;
    next.input += row.input;
    next.newInput += uncachedInput(row);
    next.output += row.output;
    next.cacheRead += row.cacheRead;
    next.cacheCreate += row.cacheCreate;
    next.modelCalls += row.modelCalls;
    next.costTicks += row.costTicks;
  }
  return next;
}

export function cacheHitRate(s: Pick<UsageSummary, "input" | "cacheRead">): number | null {
  if (!s.input) return null;
  return Math.round((s.cacheRead / s.input) * 1000) / 10;
}

/** One-decimal percent. Zero when the part or the whole is empty. */
export function sharePct(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export type UsageMixShare = {
  newInput: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
};

/** Token mix against billed volume (new input + output + cache read/write). */
export function usageMixShares(
  s: Pick<UsageSummary, "newInput" | "output" | "cacheRead" | "cacheCreate">,
): UsageMixShare {
  const newInput = Math.max(0, s.newInput);
  const output = Math.max(0, s.output);
  const cacheRead = Math.max(0, s.cacheRead);
  const cacheCreate = Math.max(0, s.cacheCreate);
  const total = newInput + output + cacheRead + cacheCreate;
  return {
    newInput: sharePct(newInput, total),
    output: sharePct(output, total),
    cacheRead: sharePct(cacheRead, total),
    cacheCreate: sharePct(cacheCreate, total),
  };
}

export function modelCostRows(
  byModel: Record<string, number>,
): { id: string; ticks: number; share: number }[] {
  const rows = Object.entries(byModel)
    .map(([id, ticks]) => ({ id, ticks }))
    .sort((a, b) => b.ticks - a.ticks);
  const total = rows.reduce((n, r) => n + r.ticks, 0);
  return rows.map((row) => ({ ...row, share: sharePct(row.ticks, total) }));
}

export function formatTokenZh(n: number): string {
  const v = Math.max(0, n);
  if (v < 10_000) return String(Math.round(v));
  if (v < 100_000_000) return `${trimDecimal(v / 10_000, 1)} 万`;
  return `${trimDecimal(v / 100_000_000, 2)} 亿`;
}

export function formatUsdFromTicks(ticks: number): string {
  if (!ticks) return "N/A";
  return `$${(ticks / USD_TICKS).toFixed(4)}`;
}

function trimDecimal(n: number, digits: number): string {
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function uniqueModels(turns: TokenTurn[]): string[] {
  return [...new Set(turns.map((row) => row.model).filter(Boolean))].sort();
}

export function uniqueSources(turns: TokenTurn[]): string[] {
  return [...new Set(turns.map((row) => row.cwd).filter(Boolean))].sort();
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type DailyUsageBar = {
  at: number;
  used: number;
  costTicks: number;
  requests: number;
};

/** One bar per local day. `days` 0 means the last 30 days. */
export function dailyUsageBars(
  turns: { at: number; total: number; costTicks?: number }[],
  days: number,
  now = Date.now(),
): DailyUsageBar[] {
  const n = days > 0 ? days : 30;
  const today = startOfLocalDay(now);
  const start = new Date(today);
  start.setDate(start.getDate() - (n - 1));
  const totals = new Map<number, { used: number; costTicks: number; requests: number }>();
  for (const row of turns) {
    const key = startOfLocalDay(row.at);
    const prev = totals.get(key) ?? { used: 0, costTicks: 0, requests: 0 };
    totals.set(key, {
      used: prev.used + row.total,
      costTicks: prev.costTicks + (row.costTicks ?? 0),
      requests: prev.requests + 1,
    });
  }
  const out: DailyUsageBar[] = [];
  for (let i = 0; i < n; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const at = day.getTime();
    const slot = totals.get(at) ?? { used: 0, costTicks: 0, requests: 0 };
    out.push({ at, ...slot });
  }
  return out;
}

export function formatInt(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString("en-US");
}

/** Compact local date for chart axis ticks, e.g. `8/28`. */
export function formatDayTick(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Axis label: full month/day at the ends, day-only in a dense 30-day chart. */
export function formatChartTick(index: number, count: number, at: number): string {
  if (!showChartTick(index, count)) return "";
  if (count > 10 && index !== 0 && index !== count - 1) return String(new Date(at).getDate());
  return formatDayTick(at);
}

export function dayBarTip(bar: DailyUsageBar): string {
  const d = new Date(bar.at);
  const parts = [`${d.getMonth() + 1}月${d.getDate()}日`, formatTokenZh(bar.used)];
  if (bar.costTicks > 0) parts.push(formatUsdFromTicks(bar.costTicks));
  if (bar.requests > 0) parts.push(`${bar.requests} 次`);
  return parts.join(" · ");
}

/** True when `at` falls on the same local calendar day as `now`. */
export function isTodayBar(at: number, now = Date.now()): boolean {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false;
  return startOfLocalDay(at) === startOfLocalDay(now);
}

/** Pixel height for a usage bar. Empty days stay 0; nonzero days get a visible stub. */
export function chartBarPx(used: number, max: number, plotPx: number): number {
  if (used <= 0 || max <= 0 || plotPx <= 0) return 0;
  return Math.min(plotPx, Math.max(3, Math.round((used / max) * plotPx)));
}

/** Which axis labels to show so 30-day charts stay readable. */
export function showChartTick(index: number, count: number): boolean {
  if (count <= 10) return true;
  return index === 0 || index === count - 1 || index % 5 === 0;
}
