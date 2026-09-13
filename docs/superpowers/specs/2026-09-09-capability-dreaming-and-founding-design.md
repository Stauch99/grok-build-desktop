# Capability Dreaming and Founding Dream

Date: 2026-09-09
Status: approved
Product: Grok Build Desktop / ACP Workbench
Amends: `docs/superpowers/specs/2026-08-30-user-memory-dreaming-design.md`, `docs/superpowers/specs/2026-09-08-memory-dreaming-overflow-design.md`

## Goal

Change dreaming from a **session recap** into a **capability review**. Nightly dreams extract teaching moments, write a warm first-person-to-you diary, patch durable habits in `USER.md`, and queue skill create/patch proposals for human approval.

Run **one founding dream** that re-reads historical Grok and Claude conversations (not the empty/clipped daily shards), clusters them, and produces a founding diary chapter plus the first real `USER.md` and skill-proposal batch. After that, nightly only digests *new* teaching moments and health-checks skills already queued or approved.

The Memory Host, 64 KiB shard cap, 8 KiB `USER.md`, first-prompt inject, and “do not vendor Mem0 / Hermes / claude-mem” remain.

## Why this exists

Live `DREAMS.md` restates three session facts. Live `USER.md` is those same three bullets. Daily files for 2026-08-31 through 2026-09-08 are 0 bytes. Nightly `mainPrompt` asks for 2–4 sentences about what the user “prefers or struggles with today” over ≤40 clipped **user** lines. Assistant replies are dropped at ingest, so correction loops never enter the dream. Cursors already sit at EOF on 366 Grok sessions, so another nightly sweep will not re-read history.

Kimi’s diary is valuable because it records a teaching scene, names a reusable capability, checks old capabilities, and commits to next-time behavior. Hermes Agent’s learning loop (skills as `SKILL.md`, review-after-session, write approval) is the operating model to copy. Do not vendor Hermes, do not run GEPA/DSPy, do not install Skills Hub.

Measured on this machine (2026-09-09):

| Source | Count | Notes |
|---|---|---|
| Grok `updates.jsonl` | 372 | ~774 MB; 2026-08 and 2026-09; cursors on 366 |
| Claude `~/.claude/projects/**/*.jsonl` | ~709 | ~620 are `claude-mem-observer-sessions`; ~45 subagents; ~40 parent conversations are the founding set |
| Codex / Kimi Code *transcripts* | present on disk | **Not founding input.** Founding *runs on* Kimi Code K3 1M. |

Workbench already lists Claude sessions (`session_scan.rs` `ClaudeJsonl`) and can replay `type: user | assistant` lines to ACP chunks (`session_replay.rs` `parse_claude_transcript`). Nightly ingest still filters `agentId !== "grok"`.

## Locked decisions (2026-09-09)

1. **Diary is a teaching narrative, not a session inventory.** Second person, specific correction scenes, next-time commitment. No fake intimacy adjectives. No “today’s corpus was empty.” No restating `USER.md` bullets.
2. **Procedural memory is a skill-proposal queue, not auto-written `SKILL.md`.** Growth page approval is required before any write into `~/.grok/skills` or `~/.agents/skills`. Matches the earlier Hermes trial rule `skills.write_approval`.
3. **Founding is a separate job from nightly.** Nightly stays one bounded ACP prompt over a lookback window (overflow spec) on `settings.dreamAgentId`. Founding does not rewind nightly cursors.
4. **Founding corpus is Grok + Claude together.** Skip Claude-mem observer projects, Claude subagents, dream sessions (`cwd` = memory root), harness/meta user lines, tool dumps, and re-injected `<user-memory>` blocks. Kimi Code / Codex *transcripts* stay later; they are not the founding runner.
5. **Founding runner is Kimi Code K3 with the 1M window.** Agent id `kimi` (`kimi acp`). Model id resolved by `pickFoundingKimiModel`: prefer `kimi-code/k3`, then exact `k3`. Never `k3-256k`, never `kimi-for-coding` / HighSpeed. If those two ids are missing, accept one catalog row whose id contains `k3` (case-insensitive) and does not contain `256k` or `k2` — that covers a locally renamed K3 1M alias. If none match, fail; **do not fall back to Grok or to K3-256k**. Do not rewrite `~/.kimi-code/config.toml` `default_model`; switch only the founding ACP session (`/model {id}` after `session/new`). Effort: `max`.
6. **Do not dump 774 MB of raw jsonl into K3.** Local TeachExtract first. Episode shards stay ≤64 KiB each (host cap). With 1M context, **prefer one founding prompt** over the extracted episodes + skill catalog + `USER.md`. Split into domain prompts only if the packed episode text exceeds `FOUNDING_ONE_SHOT_CHARS` (400_000 UTF-16 code units, ~100k+ tokens of headroom for thinking). `USER.md` stays ≤8 KiB.
7. **Contradiction still does not silent-overwrite** on nightly. First founding (`foundingAt == null`) may replace `USER.md` if validators pass. A later founding merge keeps existing lines on conflict.

This spec **amends** overflow decision 2 and 5: map-reduce is forbidden for *nightly* `USER.md`. Founding may use one long K3 prompt (the point of 1M) and only then a domain split. Nightly remains one short `main` prompt on `dreamAgentId`.

## What we are not building

- Vendoring Hermes, Mem0, Letta, Graphiti, Hindsight, claude-mem.
- GEPA / DSPy prompt evolution.
- Auto-writing skills, AGENTS.md, or `~/.grok/memory/**/MEMORY.md`.
- Raising `MAX_FILE_BYTES` as the fix.
- Per-agent `USER.md` or per-agent dream diaries.
- A second always-on daemon. App stays open for founding, same as nightly.
- Feeding `DREAMS.md` back as ingest.
- Rewriting `~/.kimi-code/config.toml` or the user’s default Kimi model.
- Running founding on `k3-256k` “because it is also K3.”

## Architecture

```
Grok updates.jsonl          Claude ~/.claude/projects/*.jsonl
        │                            │
        │  turnsFromUpdates (user + assistant; skip tool/subagent/observer)
        ▼
TeachExtract (local, no LLM)
  teach_episode | user_pref | skip
        │
        ├─ nightly: stage clipped lines into daily shards (existing 64 KiB)
        │            selectDreamInput lookback → one main prompt
        │
        └─ founding: Kimi Code `kimi acp` + K3 1M (`pickFoundingKimiModel`)
                     TeachExtract → .dreams/founding/_episodes.N.md
                     one K3 prompt if packed episodes ≤ 400k chars
                     else domain prompts (cap 12) + one merge, still on K3 1M
                     ▼
              USER.md  DREAMS.md (founding chapter + later nightly)
              skill-proposals/*.md  (pending → approved | dismissed)
```

Four units on top of the existing Memory Host / DreamJob:

| Unit | Does | Depends on |
|---|---|---|
| **TeachExtract** | From ordered turns, emit teaching episodes and standing prefs. Strip `<user-memory>`, secrets, harness text. | `turnsFromUpdates` for Grok and Claude |
| **SkillCatalog** | List skill names + one-line description from workbench inspect (user + bundled paths). Progressive disclosure: names only in the prompt. | existing inspect, not a new indexer |
| **FoundingJob** | Manual trigger. Independent watermarks. Always `kimi` + K3 1M. One-shot if it fits; else domain split. | Dream lock. **Not** `settings.dreamAgentId`. |
| **SkillProposalStore** | Pending markdown under `skill-proposals/`. Approval copies/patches a `SKILL.md`; dismissal leaves disk skills unchanged. | Memory overlay / growth page |

Nightly `DreamJob` keeps its gates, lock, and backfill loop. It changes **input** (teach episodes, not raw user lines), **prompt** (warm capability review + `<<<SKILLS>>>`), and **Claude ingest**.

## Nightly (after this spec)

### Ingest

`collectGrokPages` becomes `collectIngestPages`: `agentId === "grok" || agentId === "claude"`. Reuse `readSessionUpdates` with session `dir` so Claude jsonl replay works. Skip when:

- `skipDreamIngestPage` (memory root / dream session)
- forgotten id
- Claude project path contains `claude-mem-observer`
- `session_kind === "subagent"` or `parentSessionId` set
- Claude `isSidechain` (replay already drops these on parent files)

`filterIngestTurns` still drops tool/subagent/secrets. It **keeps assistant turns** long enough for TeachExtract, then writes only:

| Daily kind | When |
|---|---|
| `teach_episode` | User correction against the previous assistant turn (signals below) |
| `user_pref` | Standing habit / short command with memory-signal, no adjacent correction needed |
| `user_utterance` | Only if it has a memory-signal and is not a paste longer than `DREAM_LINE_MAX_CHARS` after clip |

Do not write contract bodies, brand-book pastes, or the injected `<user-memory>` blob. Strip a leading `<user-memory>…</user-memory>` (or the `# You\n- … Source:` echo) before classification.

Correction signals (Chinese and English, case-insensitive): `不要`, `别再`, `改成`, `不是`, `你录错`, `先…再`, `以后`, `总是`, `按这个`, `记住`, `always`, `never`, `don't`, `do not`, `instead`. Short-command prefs already in USER.md (`继续`, `都动`) stay prefs, not skills.

Daily line format adds `teach_episode`. Clip still 600 characters per line. Shard cap unchanged.

### Prompt

Replace the diary instruction. One `main` prompt still returns markers, now four:

```
<<<DIARY>>>
<<<USER>>>
<<<SKILLS>>>
<<<TAGLINE>>>
```

`<<<DIARY>>>` — one `## YYYY-MM-DD` section, 3–6 short paragraphs, as the workbench speaking to the user. Must include at least one concrete teaching scene when any `teach_episode` is in the selection. If the only new material is prefs, write the pref and skip inventing a scene. If selection is empty, output a single sentence that no new teaching landed, not a profile recap.

`<<<USER>>>` — full replacement, existing keep-on-conflict, Source refs, ≤8 KiB, heading + bullets. Promote habits that will still be true next month. Do not promote one-off tasks (calendar wipe, a single contract edit).

`<<<SKILLS>>>` — zero or more YAML documents separated by `---`. Each:

```yaml
action: create | patch | noop
id: slug
title: short name
target: path or empty for create
evidence: session-id and one quoted correction
summary: what the skill should do next time
```

`noop` with evidence “existing X still holds” is allowed and preferred over inventing work. Host parses leniently; invalid blocks are dropped, diary/USER still apply.

`<<<TAGLINE>>>` — unchanged cap.

Prompt also includes: current `USER.md`, diary tail, **skill catalog names only**, selected teach/pref lines. Do not attach full SKILL.md bodies.

### Lookback

Keep `DREAM_LOOKBACK_DAYS = 7` and `selectDreamInput` 40 / 6000. Weight `teach_episode` highest, then `user_pref`, then signaled `user_utterance`. Assistant-only lines never enter the selection.

## Founding dream

### Trigger

Growth-page menu item **「做一场大梦」** / **Founding dream**, separate from **「立即整理」**. Command palette `/dream founding`. Manual only. Requires `dreamingEnabled` and a logged-in `dreamAgentId`. Uses the same lock as nightly (`lockOwner === "dream"`). If nightly is running, refuse. If founding is running, nightly refuses.

State additions on `.dreams/state.json` (same file, no sqlite):

```
foundingAt: number | null
foundingStatus: "idle" | "running" | "ok" | "failed"
foundingError: string | null
foundingDomainsDone: string[]
foundingCursors: { [agentId/sessionId]: byteOffset }
foundingModelId: string | null
```

`foundingCursors` are independent of nightly `cursors`. Founding may re-read sessions already at nightly EOF. Failure does not rewind nightly cursors or blank `USER.md`.

### Runner (Kimi Code K3 1M)

`openDreamAcp` for founding always uses `agentId: "kimi"`. After `session/new` in `~/.acp-workbench/memory/`, send `/model {resolved}` then `/effort max` if the Kimi session accepts slash (same path as composer `shouldSendSessionModelSlash`). Prompt timeout is **45 minutes** (thinking + 1M). Nightly timeout stays 10 minutes.

`pickFoundingKimiModel(catalogIds: string[]): string | null` (pure, TDD):

1. If `kimi-code/k3` is in the list → that.
2. Else if exact `k3` is in the list → that.
3. Else first id matching `/k3/i` and not matching `/256k|k2/i`.
4. Else `null`.

Reject list includes `k3-256k`, `kimi-code/k3-256k`, `kimi-for-coding`, `kimi-for-coding-highspeed`.

Do not edit the user’s Kimi `config.toml`. Founding must not steal the live Kimi chat session: if `selectedAgentId === "kimi"`, still open a **new** ACP `session/new` for the dream (existing `alreadyRunning` skip of initialize is OK; a second session on the same process is required). Never `session/prompt` the user’s visible thread.

### Pipeline

1. **Gate** — Kimi logged in (`authPresent`). Resolve model via `pickFoundingKimiModel` from the live Kimi catalog (doctor/models excerpt already used by the composer). `null` → fail, do not start extract.
2. **List** Grok + Claude parent sessions (same skip list as nightly).
3. **Extract** teach episodes and prefs locally while reading transcripts from byte 0 or `foundingCursors` (resume). Persist a compact episode log as sharded files `.dreams/founding/_episodes.N.md` (≤64 KiB each, max 8). If episodes overflow 8 shards, keep highest-weight (correction + cross-session repeat) and drop the rest; record dropped count in overlay.
4. **One-shot** — concatenate episode shards + skill catalog names + current `USER.md` + global `~/.grok/memory/MEMORY.md` clipped to 4 KiB. If packed episode body length ≤ `FOUNDING_ONE_SHOT_CHARS` (400_000): **one** K3 prompt. Output founding `<<<DIARY>>>` (heading `## 大梦 · YYYY-MM-DD`, up to ~800 words), `<<<USER>>>`, `<<<SKILLS>>>`, `<<<TAGLINE>>>`. Overlay: `大梦 · K3`.
5. **Split only if over budget** — cluster by domain key from `cwd`:
   - strip `.worktrees/<name>` to the parent repo
   - map known roots: `grok_build_desktop`, `GlobalEdu` (including 柏铎/倍途 materials), `Beldore_edu_planner`, `HKUST.GZ` / `30_Academic`, `Writing Projects` / `writing-projects`, `40_Finance`, `LoveLife` / life vaults, else the last path segment
   - merge domains until ≤ **12**
   - each unfinished domain: one K3 prompt (char budget 80_000, not nightly 40 lines). Write `.dreams/founding/<domain>.md`. Resume via `foundingDomainsDone`.
   - one K3 merge over domain files + USER + catalog.
6. **Commit** — validate USER; append founding chapter to `DREAMS.md` only if the result is ≤64 KiB (host cap). If over, one merge retry with a shorter diary instruction; still over → fail, keep domain/episode files, do not append a truncated chapter. Write pending proposals; set `foundingAt`, `foundingStatus: ok`, `foundingModelId`. First founding replaces USER when validators pass. Snapshot preimage first; on USER validation failure restore preimage, keep extract files, diary not appended, status `failed`.

App must stay open. Overlay: `大梦 · K3` or `大梦 · {domain} {i}/{n}` then `大梦 · 合并`. Process death: resume extract cursors and `foundingDomainsDone`; do not redo a finished one-shot if `foundingStatus === "ok"`.

LLM budget: 1 prompt when one-shot fits; otherwise ≤12 domain + 1 merge, all on Kimi K3 1M. If Kimi logs out mid-run, fail visibly, keep extract files. Never switch the founding runner to Grok.

### Founding diary voice

The founding chapter should read like the Kimi samples the user provided: a story of being taught across weeks, named capabilities, a health check of what already works, and the person beyond the operator (life/academic/family only if episodes exist — do not invent). It is one chapter, not 372 stubs.

## Skill proposals

Directory: `$ACP_WORKBENCH_HOME/memory/skill-proposals/<id>.md`.

Front matter: `action`, `id`, `title`, `target`, `status: pending | approved | dismissed`, `evidence`, `source: founding | nightly`.

Growth page: list pending. **批准** writes or patches `~/.grok/skills/<id>/SKILL.md` (workbench-owned Grok skills). Do not write `~/.agents/skills` or Claude’s skill tree from this spec. **驳回** sets `dismissed`. No third state. Duplicate `id` while pending is replaced, not duplicated.

Nightly `noop` does not create a file.

Approved skills are what later nightly catalogs as “existing.” Pending proposals are not injected into agent sessions.

## UI

Growth header menu:

- 立即整理并更新定位语 — nightly, unchanged trigger
- 做一场大梦 — founding; if `foundingAt` set, label becomes 再做一场大梦（合并，不覆盖手改）
- 打开 USER.md / DREAMS.md — unchanged
- When pending proposals > 0, a row on the growth page lists them (title + evidence + 批准 / 驳回). Not a new route.

Diary pane shows founding chapter like any `##` entry. Overlay status distinguishes `正在做梦` vs `正在做大梦`.

i18n: zh and en for every new string.

## Errors (never block chat)

| Case | Surface |
|---|---|
| Founding while nightly lock held | Toast 已有一场梦在跑 |
| Kimi not logged in | Overlay 大梦失败：Kimi 未登录 |
| No K3 1M in catalog | Overlay 大梦失败：需要 Kimi K3 1M，未找到 k3（拒绝 k3-256k） |
| `/model` switch fail | Overlay 大梦失败：无法切换到 {id} |
| Observer/subagent skipped | Silent; not an error |
| Domain / one-shot prompt fail | `foundingStatus: failed`, keep extract files, overlay 大梦失败：{phase} |
| Merge USER validation fail | Restore USER preimage; extract files kept |
| Claude jsonl unreadable | Skip that session; continue |
| Skill YAML invalid | Drop that block; apply diary/USER |

## Testing

No live model. Fixtures only.

Must cover:

- TeachExtract: correction pair → `teach_episode`; `都动` → `user_pref`; `<user-memory>` stripped; secret skipped; assistant-only not staged.
- Claude ingest: parent jsonl `type:user/assistant` becomes turns; observer path skipped; subagent skipped; `isSidechain` skipped.
- Nightly `selectDreamInput` still ≤40 / 6000; `teach_episode` ranks above `user_utterance`.
- `parseMainOutput` four markers; missing `SKILLS` → empty list, diary still applies.
- `pickFoundingKimiModel`: prefers `kimi-code/k3`; accepts `k3`; rejects `k3-256k` and `kimi-for-coding`; accepts a `*/kimi-k3` alias; `null` on empty / only-256k catalogs.
- Founding one-shot vs split: packed episodes at 400_000 chars stay one prompt; over that clusters.
- Founding cluster: worktree cwd maps to parent; >12 domains collapse.
- Founding resume: `foundingDomainsDone` skips those domain prompts.
- Founding runner is `kimi` even when `dreamAgentId` is `grok`.
- Founding does not write nightly `cursors`.
- First founding may replace USER; second founding keep-on-conflict.
- USER validators still rollback on >8 KiB / missing Source on new lines.
- Proposal approve writes a SKILL.md fixture path; dismiss does not.
- Gates: founding refuses when lock held; nightly refuses when founding running.

E2E: growth menu shows both dream actions; pending proposal 批准/驳回 updates the list. Stub Tauri; no live CLI.

## P0 / later

**P0 (this spec):**

- TeachExtract + daily kinds
- Claude parent ingest on nightly and founding
- Nightly prompt + `<<<SKILLS>>>` + catalog names
- Strip `<user-memory>` from ingest
- Founding job on Kimi Code K3 1M (`pickFoundingKimiModel`, 45 min prompt timeout, one-shot then split)
- Growth menu + resume
- Skill proposal store + approve/dismiss
- Warm diary contract in the nightly and founding prompts
- i18n + unit tests + one growth-page E2E

**Later, not this spec:**

- Codex / Kimi founding readers
- Per-session learn-eval hook (Hermes session-end curator)
- Auto-apply skills
- Writing proposals into Claude’s skill tree
- Raising host 64 KiB
- Intimacy copy that is not backed by an episode

## Relationship to prior specs

- 2026-08-30: still one USER.md, one diary, inject on first prompt, one dream CLI, no silent overwrite on nightly.
- 2026-09-08 overflow: nightly still bounded; cursors still independent of USER writes; founding is the explicit exception to “no map-reduce.”
- DreamJob still must not write project `MEMORY.md` / `AGENTS.md`.
- Do not treat `DREAMS.md` as ingest.

## Non-goals (explicit)

- Do not summarize every historical session into the diary.
- Do not promote a one-off task into identity.
- Do not call Claude-mem, grok-build-memory MCP, or `memory_append` from the dream runner to persist founding (host files only).
- Do not use observer jsonl as a teaching corpus even though it is large.
