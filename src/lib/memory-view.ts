import { AGENT_IDS, type AgentId } from "./agent-id";
import type { DailyLine } from "./memory-ingest";
import type { MemoryState } from "./memory-state";

export type DiaryEntry = { date: string; body: string };

const LABELS: Record<AgentId, string> = {
  grok: "Grok",
  kimi: "Kimi",
  claude: "Claude",
  codex: "Codex",
};

export function parseDreamsMd(text: string): DiaryEntry[] {
  const chunks = text.split(/^## /m).map((c) => c.trim()).filter(Boolean);
  const out: DiaryEntry[] = [];
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const date = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const body = nl < 0 ? "" : chunk.slice(nl + 1).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push({ date, body });
  }
  return out;
}

export function selectedDiary(entries: DiaryEntry[], date: string | null): DiaryEntry | null {
  if (!entries.length) return null;
  return entries.find((e) => e.date === date) ?? entries[entries.length - 1] ?? null;
}

export function corpusLine(lines: DailyLine[]): string | null {
  const counts = new Map<AgentId, number>();
  for (const line of lines) counts.set(line.agentId, (counts.get(line.agentId) ?? 0) + 1);
  const parts = AGENT_IDS.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => `${LABELS[id]} ${counts.get(id)}`);
  return parts.length ? `今日语料：${parts.join(" · ")}` : null;
}

export type OverlayStatus =
  | { kind: "running" }
  | { kind: "failed" }
  | { kind: "blocked-login"; agentId: AgentId }
  | { kind: "pending"; sessionCount: number }
  | { kind: "idle"; lastAt: number | null };

export function overlayStatus(state: MemoryState, pendingSessions: number): OverlayStatus {
  if (state.lastStatus === "running") return { kind: "running" };
  if (state.lastStatus === "blocked-login") return { kind: "blocked-login", agentId: state.lastDreamAgentId ?? "grok" };
  if (state.lastStatus === "failed") return { kind: "failed" };
  if (pendingSessions > 0) return { kind: "pending", sessionCount: pendingSessions };
  return { kind: "idle", lastAt: state.lastDeepAt };
}
