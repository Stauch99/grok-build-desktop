# Motion and Perf Implementation Plan

> **For agentic workers:** Execute inline in this session. User asked to complete all 50 points. Do not commit unless asked. REQUIRED: TDD for new helpers; update existing CSS contract tests that currently forbid the new motion.

**Goal:** Make the desktop shell feel like Cursor / VS Code: compositor-friendly motion, isolated React updates, overlay scrolling.

**Architecture:** Transform/clip for chrome motion; keep DOM mounted through enter/exit; stop inheriting `:root` transitions; stop streaming from rebuilding the sidebar; coalesce scroll/resize/draft writes.

**Tech Stack:** React 19, CSS, Tauri 2 WKWebView, vitest, existing `src/lib/*` helpers.

## Global Constraints

- Tabler icons only via `src/icons.tsx`.
- Do not animate `.app` `grid-template-columns`.
- Honor `prefers-reduced-motion` (existing global reduce block).
- Existing CSS contract tests in `src/lib/css-review.test.ts` and `src/lib/sidebar-collapse.test.ts` must be updated to the new contracts, not left asserting the old bans.
- No new npm dependencies.
- Do not commit unless the user asks.

## Coverage map (50 → tasks)

| Task | Points |
|------|--------|
| 1 Tokens/CSS compositor | 2 3 5 6 7 8 9 10 11 13 19 22 39 44 46 47 49 50 |
| 2 Sidebar/Review/overlay motion | 35 36 37 38 40 41 42 48 |
| 3 React isolation | 12 17 23 24 25 26 27 28 32 45 |
| 4 Thread/stream/lists | 14 15 16 18 20 21 29 30 |
| 5 Chrome extras | 1 4 31 33 34 43 |

---

### Task 1: Motion helpers

**Files:**
- Create: `src/lib/sidebar-motion.ts`
- Create: `src/lib/sidebar-motion.test.ts`
- Create: `src/lib/composer-grow.ts`
- Create: `src/lib/composer-grow.test.ts`
- Create: `src/lib/scroll-frame.ts`
- Create: `src/lib/scroll-frame.test.ts`
- Modify: `src/lib/motion.ts` (`MOTION_MS = 160`)
- Modify: `src/lib/live-roster.ts` (fingerprint)
- Modify: `src/lib/highlight.ts` (windowed highlight)
- Modify: matching `*.test.ts`

---

### Task 2: CSS contracts

Update tokens, shell, sidebar, thread, overlays, review, composer, panes. Flip tests that currently ban accordion transition and require `:root` transition.

---

### Task 3–5: Wire React, Tauri background, fonts, git snapshot, GrokBot, split drag.

See canvas `motion-perf-upgrade-50.canvas.tsx` for the 50-point text.
