# ACP turn lease (multi-CLI)

Date: 2026-09-09

## Problem

Host send/idle is reconstructed from many flags (`busy`, `runningSessionId`, `pendingRpc`, `pendingPrompt`, `ignoreReplay`, settle timers). They desync across Grok / Kimi / Claude / Codex because each CLI ends a turn differently. Switching sessions can abandon the wrong waiter or drop the terminal event.

## What other hosts do

| Host | Turn token | Cancel | Resume |
|---|---|---|---|
| ACP v1 | Outstanding `session/prompt` | Wait for `stopReason: cancelled` | `session/load` replay vs `session/resume` |
| ACP v2 | `state_update` running/idle | Idle update with cancelled | Same session object |
| Zed `acp_thread` | One `send_task` | Barrier: cancel, wait, then next prompt | Session map, never drop by tab |
| AcpKit `RuntimeSession` | `currentTurnId` + status enum | `cancelling` then `resetTurnState` | Route by sessionId |
| Claude ACP adapter | `promptRunning` + agent-side queue | Interrupt + cancelled flag; may hang | Client still idles on any prompt result |
| Copilot CLI ACP | Prompt RPC | Often returns `end_turn` on cancel | Idle on RPC return, ignore stopReason for chrome |
| OpenCode ACP | Prompt RPC | Must actually `session.abort` | Same |

Host rule that works for all of them: **a session is live iff this client has an open prompt lease for it.** Notifications are progress. `turn_completed` / v2 idle are backups when the RPC never returns (Grok, Kimi). Stderr is not a lease closer. `end_turn` vs `cancelled` only affects copy, not idle.

## Model

`AcpTurnStore`: at most one live turn per `sessionId`, plus one catch-up turn per pane before `session/new` returns. Each turn records the CLI `agentId` so process death ends only that stdio’s leases.

Statuses: `sending | running | cancelling`.

Displayed composer busy = that pane’s displayed session is in the store (or catch-up). Background sessions keep their turns. Switching sessions does not end a turn and does not abandon another session’s waiter.

Lease ends on: prompt RPC result/error (any stopReason), `turn_completed`, v2 `state_update` idle, explicit cancel of **that** session, agent exit.

Settle 4s must not end a turn that still has a `session/prompt` waiter (Grok xhigh).

## Non-goals

Concurrent prompts on one stdio process are not guaranteed. 新对话 still cancels the bound/running session. This change makes viewing session B while A runs able to send to B, and makes A’s terminal able to close A’s lease off-screen.
