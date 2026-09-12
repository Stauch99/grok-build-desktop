# Contributing

Thanks for wanting to improve Grok Build Desktop. Please read [docs/HANDOFF.md](docs/HANDOFF.md) before large changes — the architecture is easy to fight and hard to unwind.

## Ground rules

- The desktop is not the agent. Keep runtime, tools, and model calls in the CLI.
- Match existing TypeScript / Rust style. No new CSS framework, no extra state library.
- Tests go next to the module they protect (`foo.ts` + `foo.test.ts`).
- Do not commit `.tmp-acp-probe/`, `.tmp-ui-check/`, secrets, or `auth.json`.

## Setup

```bash
git clone https://github.com/Stauch99/grok-build-desktop.git
cd grok-build-desktop
npm install
npm test
npm run typecheck
```

Desktop loop: `npm run tauri dev` (Node 22+, Rust, macOS 13+ verified).

## Pull requests

1. Branch from `feat/multi-agent-workbench` (or `main` once it exists as the default).
2. Keep the diff to one concern. Host/adapter work and CSS restyles do not belong in the same PR.
3. Fill in the PR template. Automation will label size and ping you if the body is empty.
4. Include tests for behavior changes. UI-only copy may skip tests; say so in the PR.
5. Wait for CI (`npm test`, `npm run typecheck`).

## Issues

Use a template:

- [Bug report](https://github.com/Stauch99/grok-build-desktop/issues/new?template=bug.yml)
- [Feature request](https://github.com/Stauch99/grok-build-desktop/issues/new?template=feature.yml)

Issues open with `needs-triage`. A maintainer will retarget the label. Please do not ping more than once a week.

## Code of conduct

Be precise, kind, and specific. Harassment or bait-and-switch “drive-by” AI dumps that ignore review comments will be closed.
