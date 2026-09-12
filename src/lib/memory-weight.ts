import type { DailyLine, IngestKind } from "./memory-ingest";

export const DREAM_INPUT_MAX_LINES = 40;
export const DREAM_INPUT_MAX_CHARS = 6000;
export const DREAM_LINE_MAX_CHARS = 600;

const KIND_WEIGHTS: Record<IngestKind, number> = {
  teach_episode: 5,
  user_pref: 3,
  agent_commitment: 2,
  user_utterance: 1,
};

/** Lines where the user explicitly asks the agent to remember get a boost. */
const SIGNAL_RE = /(记住|记一下|以后|总是|不要|别再|喜欢|讨厌|习惯|偏好|叫我|remember|always|never|don't|do not|prefer|habit)/i;

export function hasMemorySignal(text: string): boolean {
  return SIGNAL_RE.test(text);
}

export function normalizeForRepeat(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function containsEitherWay(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function shiftYmd(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function recencyFactor(day: string, today: string): number {
  if (day === today) return 1.2;
  if (day === shiftYmd(today, -1)) return 1.0;
  return 0.8;
}

export type WeightedLine = {
  line: DailyLine;
  score: number;
  clipped: string;
};

/** Score one day's lines. Repetition is judged across distinct sessions. */
export function weightDailyLines(lines: DailyLine[], day: string, today: string): WeightedLine[] {
  const clipped = lines.map((line) => ({
    line,
    clipped: line.text.length > DREAM_LINE_MAX_CHARS ? line.text.slice(0, DREAM_LINE_MAX_CHARS) : line.text,
  }));
  const normalized = clipped.map((row) => normalizeForRepeat(row.clipped));
  return clipped.map((row, i) => {
    let score = KIND_WEIGHTS[row.line.kind];
    if (hasMemorySignal(row.clipped)) score *= 2;
    const repeated = clipped.some(
      (other, j) =>
        j !== i && other.line.sessionId !== row.line.sessionId && containsEitherWay(normalized[i], normalized[j]),
    );
    if (repeated) score *= 2;
    score *= recencyFactor(day, today);
    return { line: row.line, score, clipped: row.clipped };
  });
}

export type DreamInputSelection = {
  /** Tagged lines in the locked daily format, text clipped to budget. */
  selected: string[];
  selectedLines: DailyLine[];
  dropped: number;
  inputChars: number;
};

function taggedLine(line: DailyLine, text: string): string {
  return `- [${line.agentId} | ${line.sessionId} | ${line.cwd} | ${line.kind}] ${text}`;
}

/**
 * Highest-weight lines first, under a hard line/char budget. Lines that do
 * not fit stay in the daily file (staged, never lost) for a later sweep.
 */
export function selectDreamInput(
  days: { lines: DailyLine[]; day: string }[],
  today: string,
  opts?: { maxLines?: number; maxChars?: number },
): DreamInputSelection {
  const maxLines = opts?.maxLines ?? DREAM_INPUT_MAX_LINES;
  const maxChars = opts?.maxChars ?? DREAM_INPUT_MAX_CHARS;
  const weighted = days
    .map(({ lines, day }) => weightDailyLines(lines, day, today))
    .flat()
    .map((row, index) => ({ row, tagged: taggedLine(row.line, row.clipped), index }));
  weighted.sort((a, b) => b.row.score - a.row.score || a.index - b.index);
  const picked: (typeof weighted)[number][] = [];
  let chars = 0;
  for (const candidate of weighted) {
    if (picked.length >= maxLines) break;
    const len = candidate.tagged.length;
    if (picked.length > 0 && chars + len > maxChars) continue;
    chars += len;
    picked.push(candidate);
  }
  return {
    selected: picked.map((p) => p.tagged),
    selectedLines: picked.map((p) => p.row.line),
    dropped: weighted.length - picked.length,
    inputChars: chars,
  };
}
