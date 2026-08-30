import type { AgentId } from "./agent-id";

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

export function formatInt(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString("en-US");
}
