import type { AgentId } from "./agent-id";
import { evaluateDreamGates, type DreamTrigger } from "./memory-gates";
import { applyUserMdRewrite } from "./memory-validate";
import { type MemoryState } from "./memory-state";

export type DreamPhase = "light" | "rem" | "deep";
export type DreamIo = { userMd: string; dreamsMd: string; dailyMd: string; state: MemoryState };
export type PhaseRunner = (phase: DreamPhase, io: DreamIo) => Promise<{ dailyMd?: string; dreamsMd?: string; userMd?: string }>;
export type DreamRunInput = {
  trigger: DreamTrigger;
  enabled: boolean;
  now: number;
  newSessionCount: number;
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
    newSessionCount: input.newSessionCount,
    lockHeld: !!io.state.lockOwner,
    trigger: input.trigger,
  });
  if (!gate.ok) return { io, started: false, reason: gate.reason };

  io = withState(io, { lockOwner: "dream", lastScanAt: input.now, lastStatus: "running", lastError: null });
  try {
    const light = await input.runPhase("light", io);
    if (light.dailyMd != null) io = { ...io, dailyMd: light.dailyMd };
    const rem = await input.runPhase("rem", io);
    if (rem.dreamsMd != null) io = { ...io, dreamsMd: rem.dreamsMd };
    const deep = await input.runPhase("deep", io);
    if (deep.userMd != null) {
      const applied = applyUserMdRewrite(io.userMd, deep.userMd);
      io = {
        ...io,
        userMd: applied.file,
        state: { ...io.state, userMdPreimage: applied.preimage },
      };
      if (applied.rejected) io = { ...io, dreamsMd: noteUnpromoted(io.dreamsMd) };
    }
    io = withState(io, { lastDeepAt: input.now, lastStatus: "ok", lockOwner: null });
    return { io, started: true };
  } catch (e) {
    return {
      io: withState(io, { lastStatus: "failed", lastError: String(e), lockOwner: null }),
      started: true,
      reason: "failed",
    };
  }
}
