# ACP Turn Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. User asked to implement in this session (no commit unless asked).

**Goal:** Make send/idle/cancel follow one per-session prompt lease so Grok, Kimi, Claude, and Codex cannot desync composer chrome from the wire.

**Architecture:** Pure reducer in `src/lib/acp-turn.ts` owned by `useAcpSession`. React `busy` is derived for the displayed session. Waiters are keyed by sessionId. Terminal `session/update` always reduces the lease even if the pane dropped painting.

**Tech Stack:** TypeScript, Vitest, existing ACP stdio host.

## Global Constraints

- Do not import `@tabler/icons-react` outside `src/icons.tsx`
- Do not commit unless the user asks
- Keep Grok xhigh settle: no 4s idle while a prompt waiter exists
- `shouldCancelAcpOnNewChat()` stays true

---

### Task 1: Turn store reducer

**Files:**
- Create: `src/lib/acp-turn.ts`
- Test: `src/lib/acp-turn.test.ts`

**Produces:** `emptyTurnStore`, `startTurn`, `bindTurnSession`, `endTurn`, `paneTurnIsLive`, `runningSessionIds`, `primaryRunningId`, `shouldDropLiveUpdate`

### Task 2: Terminal updates include v2 idle

**Files:**
- Modify: `src/lib/session-update-batch.ts`
- Test: `src/lib/session-update-batch.test.ts`

### Task 3: Session-scoped waiters + displayed busy

**Files:**
- Modify: `src/hooks/useAcpSession.ts`
- Test: `src/hooks/useAcpSession.test.ts`

Wire store into begin/send/idle/cancel/drop/resume. Filter `destHasPendingPrompt` by sessionId. `adoptSession` must not abandon another session’s waiter. `shouldSettlePaneBusy` is false when a prompt waiter exists. `ignoreReplay` does not drop terminals. `loadingSession` queues instead of dropping. Effects must not clear `runningSessionId` merely because displayed `busy` went false.

### Task 4: Verify

Run: `npx vitest run src/lib/acp-turn.test.ts src/lib/session-update-batch.test.ts src/hooks/useAcpSession.test.ts src/lib/running-sessions.test.ts src/lib/chat.test.ts src/lib/run-status.test.ts`
