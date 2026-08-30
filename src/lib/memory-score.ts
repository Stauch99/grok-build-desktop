import type { DailyLine } from "./memory-ingest";

export type MemoryCandidate = {
  text: string;
  score: number;
  sessionIds: string[];
  pairs: string[];
  sources: DailyLine[];
};

export function supportKey(line: DailyLine): string {
  return `${line.agentId}::${line.cwd}`;
}

export function scoreCandidate(text: string, supports: DailyLine[], modelScore: number): MemoryCandidate {
  const sessionIds = [...new Set(supports.map((s) => s.sessionId))];
  const pairs = [...new Set(supports.map(supportKey))];
  return { text, score: modelScore, sessionIds, pairs, sources: supports };
}

export function passesDeepGates(c: MemoryCandidate): boolean {
  return c.score >= 0.7 && c.sessionIds.length >= 3 && c.pairs.length >= 3;
}

export function shouldKeepExisting(existing: string, incoming: string): boolean {
  const a = existing.toLowerCase();
  const b = incoming.toLowerCase();
  if (b.includes(a) || a.includes(b)) return false;
  const tokens = a.split(/\W+/).filter((t) => t.length > 3);
  return tokens.some((t) => b.includes(t));
}
