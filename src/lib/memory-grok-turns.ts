import type { DreamIo } from "./memory-dream";
import type { AcpRecord } from "./acp-events";
import type { AgentId } from "./agent-id";
import { memoryCursorKey } from "./memory-clock";
import { isDreamSession } from "./memory-dream-acp";
import {
  clipDailyText,
  filterIngestTurns,
  MEMORY_FILE_MAX_BYTES,
  utf8Bytes,
  type DailyLine,
  type IngestTurn,
} from "./memory-ingest";
import { DAILY_MAX_SHARDS } from "./memory-paths";
import { isHarnessUserText } from "./chat";
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
      if (!text || isHarnessUserText(text)) continue;
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

function emptyDailyShard(day: string): string {
  return `# ${day}\n`;
}

function formatDailyLine(line: DailyLine): string {
  return `- [${line.agentId} | ${line.sessionId} | ${line.cwd} | ${line.kind}] ${clipDailyText(line.text)}\n`;
}

function shardFits(shard: string, lineText: string): boolean {
  return utf8Bytes(shard + lineText) <= MEMORY_FILE_MAX_BYTES;
}

function normalizeShardBody(text: string, day: string): string {
  if (!text) return emptyDailyShard(day);
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function applyGrokIngest(
  io: DreamIo,
  pages: GrokIngestPage[],
  day: string,
  memoryRoot = "",
  existingShards: Record<number, string> = {},
): { io: DreamIo; newSessionCount: number; shards: Record<number, string>; stoppedEarly: boolean } {
  const forgotten = new Set(io.state.forgotten);
  const cursors = { ...io.state.cursors };
  const shards: Record<number, string> = {};
  for (const [key, body] of Object.entries(existingShards)) {
    const shard = Number(key);
    if (!Number.isInteger(shard) || shard < 1 || shard > DAILY_MAX_SHARDS) continue;
    shards[shard] = normalizeShardBody(body, day);
  }
  shards[1] = io.dailyMd ? normalizeShardBody(io.dailyMd, day) : shards[1] ?? emptyDailyShard(day);
  let index = 1;
  let newSessionCount = 0;
  let stoppedEarly = false;

  for (const page of pages) {
    if (forgotten.has(page.sessionId)) continue;
    if (skipDreamIngestPage(page, memoryRoot)) continue;
    const turns = grokTurnsFromUpdates(page.rows, {
      agentId: "grok",
      sessionId: page.sessionId,
      cwd: page.cwd,
    });
    const kept = filterIngestTurns(turns, io.state.forgotten);

    let allFit = true;
    for (const line of kept) {
      const formatted = formatDailyLine(line);
      while (index <= DAILY_MAX_SHARDS) {
        if (shards[index] == null) shards[index] = emptyDailyShard(day);
        if (shardFits(shards[index], formatted)) break;
        index += 1;
      }
      if (index > DAILY_MAX_SHARDS) {
        allFit = false;
        break;
      }
      shards[index] += formatted;
    }

    if (!allFit) {
      stoppedEarly = true;
      break;
    }
    cursors[memoryCursorKey("grok", page.sessionId)] = page.nextByte;
    if (kept.length) newSessionCount += 1;
  }

  const dailyMd = shards[1];
  return { io: { ...io, dailyMd, state: { ...io.state, cursors } }, newSessionCount, shards, stoppedEarly };
}
