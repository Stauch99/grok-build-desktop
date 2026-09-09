import { displayedIsRunning, shouldAbandonInFlightOnSend } from "./running-sessions";

export type AcpTurnStatus = "sending" | "running" | "cancelling";

export type AcpTurn = {
  sessionId: string | null;
  pane: string;
  status: AcpTurnStatus;
  generation: number;
  agentId?: string;
};

export type AcpTurnStore = {
  turns: AcpTurn[];
};

export function emptyTurnStore(): AcpTurnStore {
  return { turns: [] };
}

export function runningSessionIds(store: AcpTurnStore): string[] {
  const ids: string[] = [];
  for (const turn of store.turns) {
    if (turn.sessionId && !ids.includes(turn.sessionId)) ids.push(turn.sessionId);
  }
  return ids;
}

export function turnForSession(store: AcpTurnStore, sessionId: string | null | undefined): AcpTurn | undefined {
  if (!sessionId) return undefined;
  return store.turns.find((turn) => turn.sessionId === sessionId);
}

export function turnForPane(store: AcpTurnStore, pane: string): AcpTurn | undefined {
  return store.turns.find((turn) => turn.pane === pane && turn.sessionId == null) ?? store.turns.find((turn) => turn.pane === pane);
}

export function paneTurnIsLive(
  store: AcpTurnStore,
  opts: { pane: string; sessionId: string | null },
): boolean {
  if (opts.sessionId == null && store.turns.some((turn) => turn.pane === opts.pane && turn.sessionId == null)) {
    return true;
  }
  return displayedIsRunning(opts.sessionId, runningSessionIds(store));
}

export function primaryRunningId(store: AcpTurnStore, displayedId: string | null): string | null {
  const ids = runningSessionIds(store);
  if (displayedId && ids.includes(displayedId)) return displayedId;
  return ids[0] ?? null;
}

export function startTurn(
  store: AcpTurnStore,
  opts: { sessionId: string | null; pane: string; generation: number; status?: AcpTurnStatus; agentId?: string },
): AcpTurnStore {
  const next: AcpTurn = {
    sessionId: opts.sessionId,
    pane: opts.pane,
    status: opts.status ?? (opts.sessionId ? "running" : "sending"),
    generation: opts.generation,
    agentId: opts.agentId,
  };
  const turns = store.turns.filter((turn) => {
    if (opts.sessionId) return turn.sessionId !== opts.sessionId;
    return !(turn.pane === opts.pane && turn.sessionId == null);
  });
  return { turns: [...turns, next] };
}

export function bindTurnSession(
  store: AcpTurnStore,
  pane: string,
  sessionId: string,
  agentId?: string,
): AcpTurnStore {
  let bound = false;
  const turns = store.turns.map((turn) => {
    if (bound) return turn;
    if (turn.pane === pane && turn.sessionId == null) {
      bound = true;
      return { ...turn, sessionId, status: "running" as const, agentId: turn.agentId ?? agentId };
    }
    return turn;
  });
  if (bound) return { turns };
  return startTurn(store, { sessionId, pane, generation: 0, status: "running", agentId });
}

export function markTurnCancelling(
  store: AcpTurnStore,
  opts: { sessionId?: string | null; pane?: string },
): AcpTurnStore {
  return {
    turns: store.turns.map((turn) => {
      if (opts.sessionId && turn.sessionId === opts.sessionId) return { ...turn, status: "cancelling" };
      if (!opts.sessionId && opts.pane && turn.pane === opts.pane) return { ...turn, status: "cancelling" };
      return turn;
    }),
  };
}

export function endTurn(
  store: AcpTurnStore,
  opts: { sessionId?: string | null; pane?: string; generation?: number },
): AcpTurnStore {
  return {
    turns: store.turns.filter((turn) => {
      if (opts.generation != null && turn.generation !== opts.generation) return true;
      if (opts.sessionId) return turn.sessionId !== opts.sessionId;
      if (opts.pane) return turn.pane !== opts.pane;
      return true;
    }),
  };
}

/** Drop the pre-session/new catch-up turn without touching other sessions on that pane. */
export function endCatchUpTurn(store: AcpTurnStore, pane: string): AcpTurnStore {
  return { turns: store.turns.filter((turn) => !(turn.pane === pane && turn.sessionId == null)) };
}

/** A CLI process death ends every lease that was talking to that stdio. */
export function endTurnsForAgent(store: AcpTurnStore, agentId: string): AcpTurnStore {
  return { turns: store.turns.filter((turn) => turn.agentId !== agentId) };
}

export function shouldAbandonTurnOnSend(opts: {
  pendingSessionId: string | null | undefined;
  sendingSessionId: string | null | undefined;
}): boolean {
  return shouldAbandonInFlightOnSend(opts);
}

/** Live ACP frames: paint, close the lease without painting, or ignore. */
export function shouldDropLiveUpdate(opts: {
  dest: string;
  ignoreReplay: boolean;
  terminal: boolean;
}): "apply" | "terminal" | "ignore" {
  if (opts.dest === "drop") return opts.terminal ? "terminal" : "ignore";
  if (opts.ignoreReplay) return opts.terminal ? "terminal" : "ignore";
  return "apply";
}
