import type { AcpRecord } from "./acp-events";
import type { AgentId } from "./agent-id";
import { memoryCursorKey } from "./memory-clock";
import { isDreamSession } from "./memory-dream-acp";
import type { DreamIo } from "./memory-dream";
import { filterIngestTurns, formatDailyFile, parseDailyFile, type IngestTurn } from "./memory-ingest";
import { asRecord, textFromContent } from "./text";

export type GrokTurnMeta = { agentId: AgentId; sessionId: string; cwd: string };

export type GrokIngestPage = {
  sessionId: string;
  cwd: string;
  rows: AcpRecord[];
  nextByte: number;
};

function updateFromRecord(row: AcpRecord): Record<string, unknown> {
  if (row.params != null) {
    const params = asRecord(row.params);
    return asRecord(params.update ?? params);
  }
  return asRecord(row.update ?? row);
}

function toolText(update: Record<string, unknown>): string {
  const title = String(update.title ?? "").trim();
  if (title) return title;
  const kind = String(update.kind ?? update.toolName ?? update.sessionUpdate ?? "tool").trim();
  return kind || "tool";
}

export function grokTurnsFromUpdates(rows: AcpRecord[], meta: GrokTurnMeta): IngestTurn[] {
  const out: IngestTurn[] = [];
  for (const row of rows) {
    const update = updateFromRecord(row);
    const kind = String(update.sessionUpdate ?? "");
    if (kind === "user_message_chunk") {
      const text = textFromContent(update.content).trim();
      if (!text) continue;
      out.push({ ...meta, role: "user", text });
      continue;
    }
    if (kind === "agent_message_chunk") {
      const text = textFromContent(update.content).trim();
      if (!text) continue;
      out.push({ ...meta, role: "assistant", text });
      continue;
    }
    if (kind === "tool_call" || kind === "tool_call_update") {
      out.push({ ...meta, role: "tool", text: toolText(update) });
    }
  }
  return out;
}

export function skipDreamIngestPage(page: { sessionId: string; cwd: string }, memoryRoot: string): boolean {
  if (memoryRoot && page.cwd === memoryRoot) return true;
  return isDreamSession(page.sessionId);
}

export function lightDailyOrIngest(modelText: string, ingestedDaily: string): string {
  return parseDailyFile(modelText).length > 0 ? modelText : ingestedDaily;
}

export async function finishLightAfterPrompt(
  live: DreamIo,
  ingested: DreamIo,
  modelText: Promise<string>,
): Promise<{ dailyMd: string }> {
  const text = await modelText;
  live.state = { ...live.state, cursors: { ...ingested.state.cursors } };
  return { dailyMd: lightDailyOrIngest(text, ingested.dailyMd) };
}

export function applyGrokIngest(
  io: DreamIo,
  pages: GrokIngestPage[],
  day: string,
  memoryRoot = "",
): { io: DreamIo; newSessionCount: number } {
  const forgotten = new Set(io.state.forgotten);
  const cursors = { ...io.state.cursors };
  const lines = [];
  let newSessionCount = 0;
  for (const page of pages) {
    if (forgotten.has(page.sessionId)) continue;
    if (skipDreamIngestPage(page, memoryRoot)) continue;
    const turns = grokTurnsFromUpdates(page.rows, {
      agentId: "grok",
      sessionId: page.sessionId,
      cwd: page.cwd,
    });
    const kept = filterIngestTurns(turns, io.state.forgotten);
    if (kept.length > 0) newSessionCount += 1;
    lines.push(...kept);
    cursors[memoryCursorKey("grok", page.sessionId)] = page.nextByte;
  }
  const dailyMd = formatDailyFile(day, [...parseDailyFile(io.dailyMd), ...lines]);
  return { io: { ...io, dailyMd, state: { ...io.state, cursors } }, newSessionCount };
}
