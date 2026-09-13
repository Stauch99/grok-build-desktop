import { isHarnessUserText } from "./chat";
import { stripInjectedMemory } from "./memory-inject";
import { hasMemorySignal } from "./memory-weight";
import { looksLikeSecret, type DailyLine, type IngestTurn } from "./memory-ingest";

export { stripInjectedMemory } from "./memory-inject";

const CORRECTION_RE =
  /不要|别再|改成|不是|你录错|先.+再|以后|总是|按这个|记住|always|never|don't|do not|instead/i;
const SHORT_PREF_RE = /^(继续|都动)$/;

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function extractTeachLines(turns: readonly IngestTurn[], forgotten: readonly string[] = []): DailyLine[] {
  const skip = new Set(forgotten);
  const out: DailyLine[] = [];
  const lastAssistant = new Map<string, string>();
  for (const turn of turns) {
    if (skip.has(turn.sessionId)) continue;
    if (turn.role === "tool" || turn.role === "subagent") continue;
    if (looksLikeSecret(turn.text)) continue;
    if (turn.role === "assistant") {
      lastAssistant.set(turn.sessionId, turn.text.trim());
      continue;
    }
    if (turn.role !== "user") continue;
    if (isHarnessUserText(turn.text)) continue;
    const text = stripInjectedMemory(turn.text).trim();
    if (!text || looksLikeSecret(text)) continue;
    const prev = lastAssistant.get(turn.sessionId);
    if (prev && CORRECTION_RE.test(text)) {
      out.push({
        agentId: turn.agentId,
        sessionId: turn.sessionId,
        cwd: turn.cwd,
        kind: "teach_episode",
        text: `was: ${clip(prev, 200)} → now: ${clip(text, 400)}`,
      });
      continue;
    }
    if (SHORT_PREF_RE.test(text) || hasMemorySignal(text)) {
      out.push({
        agentId: turn.agentId,
        sessionId: turn.sessionId,
        cwd: turn.cwd,
        kind: "user_pref",
        text,
      });
    }
  }
  return out;
}
