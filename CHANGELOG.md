# Changelog

All notable changes to Grok Build Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mock ACP child when `GROK_BUILD_ACP=mock` or `GROK_APP_ACP=mock`, so the UI can boot without a real CLI.
- Ghost-turn heal: if a send never reaches the agent, restore the composer after 45s.
- Settings → About copies a redacted support bundle (doctors + version).
- ACP children inherit HTTP(S) proxy env; on macOS, `scutil --proxy` fills in when env is empty.
- CI runs `npm run build` and `cargo test`. Tagged releases publish `SHA256SUMS`.
- Host session FSM (idle → connecting → ready → streaming / permission → crash).
- Agent process exit cancels open tools and appends a crash notice instead of looking idle-complete.
- Composer send button states queue / steer / blocked-permission before you press it.

## [0.6.1] - 2026-09-07

Current packaged version of the multi-agent ACP workbench (Grok / Kimi / Claude / Codex).

## [0.4.0] - 2026-08-31

Public MIT packaging of the multi-agent workbench.
