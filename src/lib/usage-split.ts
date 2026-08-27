export type UsageSplit = {
  used?: number;
  size?: number;
  input?: number;
  output?: number;
  cache?: number;
};

export function parseUsageSplit(update: Record<string, unknown>, prev?: UsageSplit): UsageSplit {
  const used = num(update.used ?? update.tokens_used ?? update.tokensUsed);
  const size = num(update.size ?? update.context_window ?? update.contextWindowTokens);
  const input = num(update.input ?? update.inputTokens ?? update.promptTokens);
  const output = num(update.output ?? update.outputTokens ?? update.completionTokens);
  const cache = num(update.cache ?? update.cacheTokens ?? update.cachedTokens ?? update.cacheReadTokens);
  const next: UsageSplit = { ...prev };
  if (used != null) next.used = used;
  if (size != null) next.size = size;
  if (input != null) next.input = input;
  if (output != null) next.output = output;
  if (cache != null) next.cache = cache;
  if (next.used == null && (next.input != null || next.output != null || next.cache != null)) {
    next.used = (next.input ?? 0) + (next.output ?? 0) + (next.cache ?? 0);
  }
  return next;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function usageRingPercents(u: UsageSplit): { input: number; output: number; cache: number; used: number } {
  const size = u.size && u.size > 0 ? u.size : 0;
  if (!size) return { input: 0, output: 0, cache: 0, used: 0 };
  const input = Math.min(100, Math.round(((u.input ?? 0) / size) * 100));
  const output = Math.min(100, Math.round(((u.output ?? 0) / size) * 100));
  const cache = Math.min(100, Math.round(((u.cache ?? 0) / size) * 100));
  const used = Math.min(100, Math.round(((u.used ?? 0) / size) * 100));
  return { input, output, cache, used };
}

export type UsagePoint = { at: number; used: number; size: number };

export function usageTrend(points: UsagePoint[], days: 7 | 30, now = Date.now()): UsagePoint[] {
  const from = now - days * 24 * 60 * 60 * 1000;
  return points.filter((p) => p.at >= from).sort((a, b) => a.at - b.at);
}

export function usageBreakdownLines(u: UsageSplit): string[] {
  const lines: string[] = [];
  if (u.input != null) lines.push(`input ${u.input}`);
  if (u.output != null) lines.push(`output ${u.output}`);
  if (u.cache != null) lines.push(`cache ${u.cache}`);
  return lines;
}

export type StatsLine = { ttftMs: number; toksPerSec: number };

export function statsLine(opts: {
  startedAt?: number;
  firstTokenAt?: number;
  endedAt?: number;
  outputTokens?: number;
}): StatsLine | null {
  const start = opts.startedAt;
  if (start == null || !Number.isFinite(start)) return null;
  const first = opts.firstTokenAt ?? start;
  const end = opts.endedAt ?? first;
  if (first < start || end < start) return null;
  const tokens = opts.outputTokens ?? 0;
  const ttftMs = Math.max(0, Math.round(first - start));
  const elapsedSec = Math.max(0.001, (end - start) / 1000);
  const toksPerSec = Math.round(tokens / elapsedSec);
  return { ttftMs, toksPerSec };
}

export function turnStatsFromItems(
  items: { kind: string; at?: number; until?: number }[],
  outputTokens?: number,
): StatsLine | null {
  let assistant: { at?: number; until?: number } | undefined;
  let user: { at?: number } | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!assistant) {
      if (it.kind === "assistant") assistant = it;
      continue;
    }
    if (it.kind === "user") {
      user = it;
      break;
    }
  }
  return statsLine({
    startedAt: user?.at,
    firstTokenAt: assistant?.at,
    endedAt: assistant?.until,
    outputTokens,
  });
}

export type StatsFooter = {
  ttftMs?: number | null;
  toksPerSec?: number | null;
  sessionTokens?: number | null;
};

export function formatStatsFooter(s: StatsFooter): string {
  const ttft = s.ttftMs == null ? "—" : compactLatency(s.ttftMs);
  const rate = s.toksPerSec == null ? "—" : String(Math.round(s.toksPerSec));
  const tok = s.sessionTokens == null ? "—" : compactCount(s.sessionTokens);
  return `TTFT ${ttft} · ${rate} tok/s · ${tok} tok`;
}

function compactLatency(ms: number): string {
  const n = Math.max(0, ms);
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${compactUnit(n / 1000)}s`;
  return `${compactUnit(n / 60_000)}m`;
}

function compactCount(n: number): string {
  const v = Math.max(0, n);
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) return `${compactUnit(v / 1000)}k`;
  return `${compactUnit(v / 1_000_000)}M`;
}

function compactUnit(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return n.toFixed(1).replace(/\.0$/, "");
}
