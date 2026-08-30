import type { AgentId } from "./agent-id";
import { isAgentId } from "./agent-id";

export type IngestKind = "user_pref" | "user_utterance" | "agent_commitment";
export type IngestTurn = {
  agentId: AgentId;
  sessionId: string;
  cwd: string;
  role: "user" | "assistant" | "tool" | "subagent";
  text: string;
  kind?: IngestKind;
};
export type DailyLine = {
  agentId: AgentId;
  sessionId: string;
  cwd: string;
  kind: IngestKind;
  text: string;
};

export function looksLikeSecret(text: string): boolean {
  return /\b(sk-|ghp_|xai-|AKIA|api[_-]?key\s*[:=]|-----BEGIN)/i.test(text);
}

export function filterIngestTurns(turns: IngestTurn[], forgotten: readonly string[]): DailyLine[] {
  const skip = new Set(forgotten);
  const out: DailyLine[] = [];
  for (const turn of turns) {
    if (skip.has(turn.sessionId)) continue;
    if (turn.role === "tool" || turn.role === "subagent") continue;
    if (looksLikeSecret(turn.text)) continue;
    const kind =
      turn.kind ??
      (turn.role === "user" ? "user_utterance" : null);
    if (!kind) continue;
    if (turn.role === "assistant" && kind !== "agent_commitment") continue;
    out.push({ agentId: turn.agentId, sessionId: turn.sessionId, cwd: turn.cwd, kind, text: turn.text.trim() });
  }
  return out;
}

export function formatDailyFile(day: string, lines: DailyLine[]): string {
  const body = lines.map((l) => `- [${l.agentId} | ${l.sessionId} | ${l.cwd} | ${l.kind}] ${l.text}`).join("\n");
  return `# ${day}\n${body}\n`;
}

export function parseDailyFile(text: string): DailyLine[] {
  const out: DailyLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- \[(\w+) \| ([^|]+) \| ([^|]+) \| (\w+)\] (.*)$/);
    if (!m) continue;
    const agentId = m[1].trim();
    const kind = m[4].trim();
    if (!isAgentId(agentId)) continue;
    if (kind !== "user_pref" && kind !== "user_utterance" && kind !== "agent_commitment") continue;
    out.push({
      agentId,
      sessionId: m[2].trim(),
      cwd: m[3].trim(),
      kind,
      text: m[5],
    });
  }
  return out;
}
