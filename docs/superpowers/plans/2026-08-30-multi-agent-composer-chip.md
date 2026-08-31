# Composer selectedAgentId Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Empty composer can pick grok|kimi|claude|codex; an open session cannot switch agent. `startAgent` / `session/new` use `selectedAgentId`.

**Files for Task 1 (new, no isolation):**
- Create: `src/components/AgentChip.tsx`
- Create: `src/lib/agent-chip.test.ts` — test `agentChipDisabled` / labels if extracted

Extract to `src/lib/agent-chip.ts`:
```
export function agentChipDisabled(hasOpenSession: boolean): boolean {
  return !canChangeSelectedAgent(hasOpenSession);
}
export function agentChipLabel(id: AgentId): string {
  return id === "grok" ? "Grok" : id === "kimi" ? "Kimi" : id === "claude" ? "Claude" : "Codex";
}
```

Tests for labels + disabled. AgentChip.tsx is a thin button row using AGENT_IDS.

Commit 1: feat: add composer agent chip labels and lock
(only agent-chip.ts + test + AgentChip.tsx)

**Task 2 isolation useAppModel + Composer + useAcpSession:**
- selectedAgentId state default "grok"
- nextSelectedAgent(hasOpenSession, current, requested)
- pass to startAgent(selectedAgentId)
- useAcpSession start/new uses that id

If useAcpSession isolation is too large, only wire startAgent(selectedAgentId) in the existing start call site.

Commit: feat: start ACP on the selected composer agent
