# Work-run collapse in the output stream

Date: 2026-09-06
Status: approved (implement immediately)

## Goal

Collapse each consecutive thought + tool run into one summary line. The thread shows assistant output by default. Click the line to expand the existing work timeline.

## Locked decisions

- Live and historical runs start collapsed. Live header shows the current action; composer WaitPill remains the stop control.
- Settled header: `使用 N 个工具，操作结果：…` with up to four keywords from completed tool titles/details. No model call. Fallback to count only.
- Failures stay collapsed; header marks red and appends ` · K 个失败`.
- Live copy is playful (rotating verbs/phrases). `aria-label` stays neutral.
- Expand state is component-local. Not persisted. `showThinking` only filters the expanded timeline; a thought-only run is hidden when thinking is off.
- Wrap `groupWorkRuns` work blocks. Do not change ACP, chat item types, or `showThinking` defaults.

## Non-goals

- Side-pane process inspector
- LLM-written summaries
- Remembering expand state across sessions
- Replacing WaitPill / permission cards
