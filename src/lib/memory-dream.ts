import type { AgentId } from "./agent-id";
import { evaluateDreamGates, type DreamTrigger } from "./memory-gates";
import { applyUserMdRewrite } from "./memory-validate";
import { type MemoryState } from "./memory-state";

export type DreamPhase = "gather" | "main";
export type DreamIo = { userMd: string; dreamsMd: string; dailyMd: string; state: MemoryState };
export type PhaseResult = {
  dailyMd?: string;
  dreamsMd?: string;
  userMd?: string;
  state?: MemoryState;
  tagline?: string;
};
export type PhaseRunner = (phase: DreamPhase, io: DreamIo) => Promise<PhaseResult>;
export type DreamRunInput = {
  trigger: DreamTrigger;
  enabled: boolean;
  now: number;
  pendingMaterial: number;
  thresholdSessions: number;
  dreamAgentId: AgentId;
  loggedIn: readonly AgentId[];
  io: DreamIo;
  runPhase: PhaseRunner;
};
export type DreamRunResult = { io: DreamIo; started: boolean; reason?: string };

function withState(io: DreamIo, patch: Partial<MemoryState>): DreamIo {
  return { ...io, state: { ...io.state, ...patch } };
}

function noteUnpromoted(dreamsMd: string): string {
  return `${dreamsMd.trim() ? dreamsMd.replace(/\s*$/, "\n\n") : ""}未晋升\n`;
}

const DAY_RE = /^# (\d{4}-\d{2}-\d{2})/m;

function dayFromDaily(dailyMd: string): string | null {
  const day = DAY_RE.exec(dailyMd)?.[1];
  return day ?? null;
}

/**
 * A sweep is two local steps around exactly one LLM call:
 *   gather — local merge of new session lines into the daily file (no model);
 *   main   — single prompt producing diary + USER.md + tagline.
 */
export async function runDreamSweep(input: DreamRunInput): Promise<DreamRunResult> {
  let io = { ...input.io, state: { ...input.io.state } };
  io = withState(io, { lastDreamAgentId: input.dreamAgentId });
  if (!input.loggedIn.includes(input.dreamAgentId)) {
    return { io: withState(io, { lastStatus: "blocked-login" }), started: false, reason: "blocked-login" };
  }
  const gate = evaluateDreamGates({
    enabled: input.enabled,
    now: input.now,
    lastDeepAt: io.state.lastDeepAt,
    lastScanAt: io.state.lastScanAt,
    pendingMaterial: input.pendingMaterial,
    thresholdSessions: input.thresholdSessions,
    lockHeld: !!io.state.lockOwner,
    trigger: input.trigger,
  });
  if (!gate.ok) return { io, started: false, reason: gate.reason };

  io = withState(io, { lockOwner: "dream", lastScanAt: input.now, lastStatus: "running", lastError: null });
  try {
    const gathered = await input.runPhase("gather", io);
    if (gathered.dailyMd != null) io = { ...io, dailyMd: gathered.dailyMd };
    if (gathered.state != null) io = { ...io, state: { ...io.state, ...gathered.state } };
    const main = await input.runPhase("main", io);
    if (main.dreamsMd != null) io = { ...io, dreamsMd: main.dreamsMd };
    if (main.userMd != null) {
      const applied = applyUserMdRewrite(io.userMd, main.userMd);
      io = {
        ...io,
        userMd: applied.file,
        state: { ...io.state, userMdPreimage: applied.preimage },
      };
      if (applied.rejected) io = { ...io, dreamsMd: noteUnpromoted(io.dreamsMd) };
    }
    io = withState(io, {
      lastDeepAt: input.now,
      lastStatus: "ok",
      lockOwner: null,
      pendingSinceDeep: { sessions: 0, mcpBatches: 0 },
      dailySeenDay: dayFromDaily(io.dailyMd),
    });
    if (main.tagline) {
      io = withState(io, { tagline: main.tagline, taglineAt: input.now });
    }
    return { io, started: true };
  } catch (e) {
    return {
      io: withState(io, { lastStatus: "failed", lastError: String(e), lockOwner: null }),
      started: true,
      reason: "failed",
    };
  }
}
