import { shouldKeepSessionUpdate, type ChatState } from "../lib/chat";
import { shouldClearBusyOnSessionUpdate } from "../lib/session-update-batch";
import { isDreamSession } from "../lib/memory-dream-acp";
import { asRecord } from "../lib/text";
import { t } from "../lib/i18n";

export function shouldHonorAgentExit(opts: {
  spawning: boolean;
  liveGeneration: number;
  eventGeneration: number;
}): boolean {
  if (opts.spawning) return false;
  if (opts.eventGeneration > 0 && opts.liveGeneration > 0 && opts.eventGeneration !== opts.liveGeneration) {
    return false;
  }
  return true;
}

export function sessionIdFromNewResult(result: unknown): string {
  const sid = String(asRecord(result).sessionId ?? "");
  if (!sid) throw new Error(t("zh", "acp.noSessionId"));
  return sid;
}

export function isPromptStopResult(result: unknown): boolean {
  return !!result && typeof result === "object" && "stopReason" in result;
}

export function shouldClearBusyOnPromptResult(result: unknown, hadLiveWaiter: boolean, method?: string): boolean {
  if (!hadLiveWaiter || result == null) return false;
  if (method === "session/prompt") return true;
  return isPromptStopResult(result);
}

export function shouldClearBusyOnPromptError(error: unknown, hadLiveWaiter: boolean): boolean {
  return hadLiveWaiter && error != null;
}

export function shouldClearBusyAfterPromptCatch(e: unknown): boolean {
  return !isAbandonedPromptError(e);
}

export function shouldKeepBusyForNewerPrompt(startedGen: number, activeGen: number): boolean {
  return activeGen !== startedGen;
}

export type SessionUpdateDest = string | "drop";

export function sessionUpdateDest(
  openBySession: Readonly<Record<string, string>>,
  updateSessionId: string | null,
  fallbackPane = "main",
): SessionUpdateDest {
  if (isDreamSession(updateSessionId)) return "drop";
  if (updateSessionId && openBySession[updateSessionId]) return openBySession[updateSessionId];
  const fallbackSession =
    Object.entries(openBySession).find(([, pane]) => pane === fallbackPane)?.[0] ?? null;
  if (!shouldKeepSessionUpdate(fallbackSession, updateSessionId)) return "drop";
  return fallbackPane;
}

/** A cancelled/finished turn must release the prompt waiter even if that session is off-screen. */
export function shouldReleasePromptOnDroppedUpdate(opts: {
  dest: SessionUpdateDest;
  params: Record<string, unknown>;
  sessionId: string | null;
  runningSessionId: string | null;
  boundSessionId: string | null;
}): boolean {
  if (opts.dest !== "drop") return false;
  if (!shouldClearBusyOnSessionUpdate(opts.params)) return false;
  const sid = opts.sessionId;
  if (!sid) return false;
  return opts.runningSessionId === sid || opts.boundSessionId === sid;
}

/** After abandoning a zombie in-flight prompt, the follow-up send must go out. */
export function shouldBlockSendWhileBusy(opts: { busy: boolean; justAbandonedInFlight: boolean }): boolean {
  if (opts.justAbandonedInFlight) return false;
  return opts.busy;
}

/** A leftover session/prompt waiter must not block the queue once the pane is idle. */
export function shouldHoldComposerQueue(opts: { pendingPrompt: boolean; busy: boolean }): boolean {
  return opts.pendingPrompt && opts.busy;
}

export function shouldScanTranscriptForStopReason(opts: {
  busy: boolean;
  knownStopReason: string | null | undefined;
}): boolean {
  return opts.busy && opts.knownStopReason == null;
}

/** Opening a cancelled (or already-idle) session must release the composer lock. */
export function shouldUnlockComposerOnResume(opts: {
  lastStopReason: string | null | undefined;
  userAfterLastStop?: boolean;
  pendingPrompt: boolean;
  busy: boolean;
}): boolean {
  const stop = (opts.lastStopReason ?? "").toLowerCase();
  if ((stop === "cancelled" || stop === "canceled") && !opts.userAfterLastStop) return true;
  return opts.pendingPrompt && !opts.busy;
}

/** Historical turn_completed during session/load must not close a still-open prompt. */
export function shouldApplyReplayTerminal(opts: {
  ignoreReplay: boolean;
  updateSessionId: string | null;
  displayedSessionId: string | null;
  pendingPrompt: boolean;
}): boolean {
  if (!opts.ignoreReplay) return true;
  const forDisplayed =
    opts.updateSessionId == null || opts.updateSessionId === opts.displayedSessionId;
  if (forDisplayed && opts.pendingPrompt) return false;
  return true;
}

export function withEchoedUser(chat: ChatState, text: string, idPrefix: string, at: number): ChatState {
  return {
    ...chat,
    items: [...chat.items, { kind: "user", id: `${idPrefix}-${chat.nextId}`, text, at }],
    nextId: chat.nextId + 1,
  };
}

export function echoUserOnce(chat: ChatState, text: string, idPrefix: string, at: number): ChatState {
  const last = chat.items[chat.items.length - 1];
  if (last?.kind === "user" && last.text === text) return chat;
  return withEchoedUser(chat, text, idPrefix, at);
}

export function withPromptFail(chat: ChatState, text: string, at: number): ChatState {
  const last = chat.items[chat.items.length - 1];
  if (last?.kind === "tool" && last.status === "failed" && last.detail === text) return chat;
  return {
    ...chat,
    items: [
      ...chat.items,
      {
        kind: "tool",
        id: `fail-${chat.nextId}`,
        title: t("zh", "acp.requestFailed"),
        status: "failed",
        detail: text,
        at,
      },
    ],
    nextId: chat.nextId + 1,
  };
}

export function isAbandonedPromptError(e: unknown): boolean {
  return e instanceof Error && e.message === "prompt-abandoned";
}

export function waiterMatchesSession(
  waiterSid: string | undefined,
  opts?: { sessionId?: string | null },
): boolean {
  if (!opts || !("sessionId" in opts)) return true;
  if (opts.sessionId == null) return !waiterSid;
  return waiterSid === opts.sessionId;
}

export function abandonPendingForDest(
  pendingRpc: Map<number, { reject: (e: Error) => void }>,
  pendingDest: Map<number, string>,
  dest: string,
  opts?: { sessionId?: string | null; pendingSession?: Map<number, string> },
): void {
  for (const [id, pane] of [...pendingDest.entries()]) {
    if (pane !== dest) continue;
    const waiterSid = opts?.pendingSession?.get(id);
    if (!waiterMatchesSession(waiterSid, opts)) continue;
    pendingRpc.get(id)?.reject(new Error("prompt-abandoned"));
    pendingRpc.delete(id);
    pendingDest.delete(id);
    opts?.pendingSession?.delete(id);
  }
}

export function destHasPendingPrompt(
  pendingRpc: Map<number, { method?: string }>,
  pendingDest: Map<number, string>,
  dest: string,
  opts?: { sessionId?: string | null; pendingSession?: Map<number, string> },
): boolean {
  for (const [id, pane] of pendingDest) {
    if (pane !== dest || pendingRpc.get(id)?.method !== "session/prompt") continue;
    const waiterSid = opts?.pendingSession?.get(id);
    if (!waiterMatchesSession(waiterSid, opts)) continue;
    return true;
  }
  return false;
}

export function shouldIdleAfterPromptRpc(opts: {
  clearOnResult: boolean;
  otherPromptWaiters: boolean;
}): boolean {
  return opts.clearOnResult && !opts.otherPromptWaiters;
}

export function shouldSettlePaneBusy(opts: { settled: boolean; pendingPrompt: boolean }): boolean {
  return opts.settled && !opts.pendingPrompt;
}

export function cancelTargetSessionId(
  runningSessionId: string | null | undefined,
  boundSessionId: string | null | undefined,
): string | null {
  return runningSessionId || boundSessionId || null;
}

