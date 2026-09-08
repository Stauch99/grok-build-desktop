# Changelog

All notable changes to Grok Build Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.4] - 2026-09-09

### Added

- Live work row uses the accent-tinted animated Grok bot (one silhouette per theme color).
- Daily memory overflow shards, a seven-day dream lookback, and a bounded first-launch catch-up sweep.

### Fixed

- Working chrome follows real work: hung `session/prompt` and Grok `Get task output` polls no longer pin the sidebar or “工作了 …” timer for hours.
- Stall copy lives only on the timeline yellow bar; the composer no longer stacks a second stall capsule or hang-recover card.
- Quiet turns hard-idle after ten minutes even if a spawn tool never completed.

## [0.6.3] - 2026-09-08

### Added

- Growth memory page: tagline, intimacy/growth heatmap, diary + timeline, and a 4–20 session sweep threshold.
- `memory-mcp` stdio sidecar (`grok-build-memory`) so any MCP CLI can read memory and append daily notes; Settings can revoke the four live CLI registrations.
- Hang recover banner after a busy turn goes quiet with nothing in flight (resend / restore draft / wait).
- Header jobs menu to inspect and stop in-flight work.

### Fixed

- Ghost-heal no longer cancels a live turn that is still thinking after `session/prompt` was written.
- Grok subagent sessions nest under the parent in the sidebar and open from the header catalog.
- Queued follow-ups stay as their own bubbles: leftover IME Enter no longer glues the next line into the same send, and a queued prompt appears in the thread immediately.
- Pasted images are copied into the project and sent as ACP `resource`/`image` blocks, not only as `@path` text.

## [0.6.2] - 2026-09-07

### Added

- Mock ACP child when `GROK_BUILD_ACP=mock` or `GROK_APP_ACP=mock`, so the UI can boot without a CLI.
- Ghost-turn heal: if a send never reaches the agent, restore the composer after 45s.
- Settings → About copies a redacted support bundle (doctors + version).
- ACP children inherit HTTP(S) proxy env; on macOS, `scutil --proxy` fills in when env is empty.
- CI runs `npm run build` and `cargo test`. Tagged releases publish `SHA256SUMS`.
- Host session FSM (idle → connecting → ready → streaming / permission → crash).
- Agent process exit cancels open tools and appends a crash notice instead of looking idle-complete.
- Composer send button states queue / steer / blocked-permission before you press it.

### Changed

- Untitled Grok shells with no real user turn stay off the session list.
- HTML artifacts preview over `asset://` (CSP `frame-src` includes the asset protocol).
- Selection actions, work-run, and timeline own their chrome; live tools stay on the spine.

## [0.6.1] - 2026-09-07

Current packaged version of the multi-agent ACP workbench (Grok / Kimi / Claude / Codex).

## [0.4.0] - 2026-08-31

Public MIT packaging of the multi-agent workbench.
