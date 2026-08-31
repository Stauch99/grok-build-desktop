# Multi-Agent Process Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Grok ACP child with `AgentPool` keyed by `AgentId`, accept `start_agent(agentId)` / `send_raw(..., agentId)`, and emit tagged ACP envelopes — without regressing Grok chat when `agentId` is omitted.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Wave 2 already shipped `AgentId`, `AgentPool<T>`, `wrapAcpEvent` / `unwrapAcpEvent`, and `default_spawn_profile`. This wave wires them. Non-Grok children spawn from the profile table; missing binaries fail with a clear error. Do not extract GrokAdapter or rewrite hub UI here.

**Tech Stack:** TypeScript + Vitest, Rust tests in `agent_host` / `rpc_allowlist`. No new dependencies.

## Global Constraints

- Spec path: `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`.
- `AgentId` closed enum: `"grok" | "kimi" | "claude" | "codex"` only.
- Omitted / empty `agentId` means `grok` (legacy callers).
- Starting one agent must **not** kill other agents’ children. Restarting the same `agentId` replaces only that child.
- Grok child keep `AgentRpcCaps::grok_legacy()` (`_x.ai/*` on, `authenticate` / `session/set_mode` off). Other children use `acp_common()`.
- Events: `acp-message` / `acp-request` / `acp-stderr` / `agent-exit` payloads include `agentId` via `{ agentId, generation, payload }` for JSON events; stderr/exit use `{ agentId, generation, payload }` as well (`payload` is the line or `null`).
- Frontend unwraps with existing `unwrapAcpEvent` so legacy bare JSON-RPC still works.
- Do not implement plugins, imagine/video, or hub UI in this plan.
- Leave dirty working-tree files unless this task’s Files list includes them. `git add` only owned files. Never `git add -A`.
- `lib.rs` and `api.ts` are dirty with unrelated P0–P2 edits. Isolation: copy aside → restore HEAD → patch → commit owned files → restore dirty → re-apply this task’s hunks.
- Tests: `npm test -- src/lib/<file>.test.ts`; `cargo test --manifest-path src-tauri/Cargo.toml agent_host` / `rpc_allowlist`. TDD: failing test first.

## Follow-on (do not execute in this file)

- AgentsStore FS + hub chrome
- Kimi / Claude / Codex session adapters and doctor
- Usage overlay brand switcher + subscription-only ring
- `~/.acp-workbench` migration

---

### Task 1: Parse agent id arg, tag events, drain pool

**Files:**
- Modify: `src-tauri/src/agent_host.rs`

**Interfaces:**
- Consumes: existing `AgentId`, `AgentPool`
- Produces:
  - `pub(crate) fn parse_agent_id_arg(s: Option<&str>) -> Result<AgentId, String>` — `None` / `""` / whitespace → `Grok`; unknown → `Err` containing `未知 agent`
  - `pub(crate) fn tagged_acp_event(agent_id: AgentId, generation: u64, payload: Value) -> Value` — object with string `agentId`, number `generation`, `payload` key
  - `AgentPool::drain(&mut self) -> Vec<(AgentId, T)>`

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`)

```rust
    #[test]
    fn parse_agent_id_arg_defaults_to_grok() {
        assert_eq!(parse_agent_id_arg(None).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("")).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("  ")).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("claude")).unwrap(), AgentId::Claude);
        let err = parse_agent_id_arg(Some("gemini")).unwrap_err();
        assert!(err.contains("未知 agent"));
    }

    #[test]
    fn tagged_acp_event_envelope() {
        let v = tagged_acp_event(AgentId::Kimi, 4, serde_json::json!({"jsonrpc":"2.0"}));
        assert_eq!(v["agentId"], "kimi");
        assert_eq!(v["generation"], 4);
        assert_eq!(v["payload"]["jsonrpc"], "2.0");
    }

    #[test]
    fn pool_drain_empties() {
        let mut pool = AgentPool::new();
        pool.insert(AgentId::Grok, 1);
        pool.insert(AgentId::Kimi, 2);
        let mut pairs = pool.drain();
        pairs.sort_by_key(|(id, _)| id.as_str());
        assert_eq!(pairs, vec![(AgentId::Grok, 1), (AgentId::Kimi, 2)]);
        assert!(pool.is_empty());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture`
Expected: FAIL compile (`parse_agent_id_arg` / `tagged_acp_event` / `drain` missing)

- [ ] **Step 3: Write minimal implementation**

Add `use serde_json::{json, Value};` at the top of `agent_host.rs`.

```rust
pub(crate) fn parse_agent_id_arg(s: Option<&str>) -> Result<AgentId, String> {
    match s.map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(AgentId::Grok),
        Some(v) => AgentId::parse(v).ok_or_else(|| format!("未知 agent: {v}")),
    }
}

pub(crate) fn tagged_acp_event(agent_id: AgentId, generation: u64, payload: Value) -> Value {
    json!({
        "agentId": agent_id.as_str(),
        "generation": generation,
        "payload": payload,
    })
}
```

On `AgentPool<T>`:

```rust
    pub(crate) fn drain(&mut self) -> Vec<(AgentId, T)> {
        self.inner.drain().collect()
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agent_host.rs
git commit -m "$(cat <<'EOF'
feat: parse AgentId args and tag ACP event envelopes

EOF
)"
```

---

### Task 2: Per-agent RPC capability presets

**Files:**
- Modify: `src-tauri/src/rpc_allowlist.rs`

**Interfaces:**
- Consumes: `crate::agent_host::AgentId`
- Produces:
  - `AgentRpcCaps::acp_common()` — load/list/set_mode/set_config/authenticate true, `vendor_xai` false
  - `pub(crate) fn caps_for_agent(id: AgentId) -> AgentRpcCaps` — Grok → `grok_legacy()`, else `acp_common()`
  - Keep `rpc_payload_allowed` → grok_legacy (no behavior change for unscoped callers)

- [ ] **Step 1: Write the failing tests** (append to existing `#[cfg(test)]` in `rpc_allowlist.rs`)

```rust
    #[test]
    fn caps_for_agent_splits_grok_from_others() {
        use crate::agent_host::AgentId;
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "_x.ai/billing" }),
            &caps_for_agent(AgentId::Grok)
        ));
        assert!(!rpc_payload_allowed_for(
            &json!({ "method": "authenticate" }),
            &caps_for_agent(AgentId::Grok)
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "authenticate" }),
            &caps_for_agent(AgentId::Kimi)
        ));
        assert!(!rpc_payload_allowed_for(
            &json!({ "method": "_x.ai/billing" }),
            &caps_for_agent(AgentId::Claude)
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_mode" }),
            &caps_for_agent(AgentId::Codex)
        ));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml caps_for_agent_splits_grok_from_others -- --nocapture`
Expected: FAIL compile (`caps_for_agent` / `acp_common` missing)

- [ ] **Step 3: Write minimal implementation**

```rust
    pub fn acp_common() -> Self {
        Self {
            load_session: true,
            list_sessions: true,
            set_mode: true,
            set_config_option: true,
            authenticate: true,
            vendor_xai: false,
        }
    }
```

```rust
use crate::agent_host::AgentId;

pub(crate) fn caps_for_agent(id: AgentId) -> AgentRpcCaps {
    match id {
        AgentId::Grok => AgentRpcCaps::grok_legacy(),
        AgentId::Kimi | AgentId::Claude | AgentId::Codex => AgentRpcCaps::acp_common(),
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rpc_allowlist -- --nocapture`
Expected: PASS (existing + new)

- [ ] **Step 5: Commit**

`rpc_allowlist.rs` should be clean vs HEAD. If dirty, isolate.

```bash
git add src-tauri/src/rpc_allowlist.rs
git commit -m "$(cat <<'EOF'
feat: pick ACP RPC allowlist from AgentId

EOF
)"
```

---

### Task 3: Frontend start-id and event unwrap helpers

**Files:**
- Create: `src/lib/acp-host.ts`
- Create: `src/lib/acp-host.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `isAgentId` from `./agent-id`; `unwrapAcpEvent` from `./acp-event-tag`
- Produces:
  - `export function resolveStartAgentId(agentId?: string | null): AgentId` — empty → `grok`; unknown throws `Error` whose message contains `未知 agent`
  - `export function acpMessageFromEvent(raw: unknown): { agentId: AgentId; payload: unknown }` — delegates to `unwrapAcpEvent`
  - `export function shouldDropAcpEvent(paneAgent: AgentId, eventAgent: AgentId): boolean` — true when they differ

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { acpMessageFromEvent, resolveStartAgentId, shouldDropAcpEvent } from "./acp-host";

describe("resolveStartAgentId", () => {
  it("defaults blank to grok and rejects unknown", () => {
    expect(resolveStartAgentId()).toBe("grok");
    expect(resolveStartAgentId(null)).toBe("grok");
    expect(resolveStartAgentId("")).toBe("grok");
    expect(resolveStartAgentId("codex")).toBe("codex");
    expect(() => resolveStartAgentId("gemini")).toThrow(/未知 agent/);
  });
});

describe("acpMessageFromEvent", () => {
  it("unwraps tagged envelopes and legacy bodies", () => {
    const payload = { jsonrpc: "2.0", method: "session/update" };
    expect(acpMessageFromEvent({ agentId: "claude", generation: 1, payload })).toEqual({
      agentId: "claude",
      payload,
    });
    expect(acpMessageFromEvent(payload)).toEqual({ agentId: "grok", payload });
  });
});

describe("shouldDropAcpEvent", () => {
  it("drops other agents", () => {
    expect(shouldDropAcpEvent("grok", "grok")).toBe(false);
    expect(shouldDropAcpEvent("grok", "kimi")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/acp-host.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import { isAgentId, type AgentId } from "./agent-id";
import { unwrapAcpEvent } from "./acp-event-tag";

export function resolveStartAgentId(agentId?: string | null): AgentId {
  const trimmed = (agentId ?? "").trim();
  if (!trimmed) return "grok";
  if (!isAgentId(trimmed)) throw new Error(`未知 agent: ${trimmed}`);
  return trimmed;
}

export function acpMessageFromEvent(raw: unknown): { agentId: AgentId; payload: unknown } {
  const tagged = unwrapAcpEvent(raw);
  return { agentId: tagged.agentId, payload: tagged.payload };
}

export function shouldDropAcpEvent(paneAgent: AgentId, eventAgent: AgentId): boolean {
  return paneAgent !== eventAgent;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/acp-host.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/acp-host.ts src/lib/acp-host.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve start AgentId and drop cross-agent ACP events

EOF
)"
```

---

### Task 4: Unwrap ACP events in the Tauri listen helpers

**Files:**
- Modify: `src/api.ts` (`startAgent`, `stopAgent`, `sendRaw`, `onAcpMessage`, `onAcpRequest`, `onAcpStderr`, `onAgentExit`)

**Interfaces:**
- Consumes: `resolveStartAgentId`, `acpMessageFromEvent` from `./lib/acp-host`; `AgentId` from `./lib/agent-id`
- Produces:
  - `startAgent(agentId?: AgentId)` → `invoke("start_agent", { agentId: resolveStartAgentId(agentId) })`
  - `stopAgent(agentId?: AgentId | null)` → `invoke("stop_agent", { agentId: agentId ?? null })`
  - `sendRaw(payload, agentId?: AgentId)` → `invoke("send_raw", { payload, agentId: resolveStartAgentId(agentId) })`
  - `onAcpMessage` / `onAcpRequest`: unwrap envelope, pass `payload` as `JsonRpc` to the existing handler (signature unchanged)
  - `onAcpStderr`: if payload is `{ agentId, payload: string }` use inner string; if payload is a string, use it (legacy)
  - `onAgentExit`: still `handler()` with no args (signature unchanged). If payload is tagged, ignore extra fields.

Do **not** change `useAcpSession` in this task. Defaulting `agentId` to grok keeps current boot.

**Isolation:** `api.ts` is dirty.

```bash
cp src/api.ts /tmp/api.ts.dirty
git show HEAD:src/api.ts > src/api.ts
# apply the signature/listen changes
git add src/api.ts
git commit ...
mv /tmp/api.ts.dirty src/api.ts
# re-apply the same listen/start/send changes onto the restored dirty file
```

- [ ] **Step 1: No standalone Vitest for api.ts** (Tauri `listen` is not unit-tested here). The behavior is specified by Task 3 helpers. After the patch, `onAcpMessage` **must** call `acpMessageFromEvent`.

Manual check in the commit: grep the file for `acpMessageFromEvent` and `resolveStartAgentId`.

- [ ] **Step 2: Implement**

Keep existing return types. Change:

```ts
import type { AgentId } from "./lib/agent-id";
import { acpMessageFromEvent, resolveStartAgentId } from "./lib/acp-host";

export const startAgent = (agentId?: AgentId) =>
  invoke<{ ok: boolean; grok?: string; agentId?: string }>("start_agent", {
    agentId: resolveStartAgentId(agentId),
  });
export const stopAgent = (agentId?: AgentId | null) =>
  invoke<void>("stop_agent", { agentId: agentId ?? null });
export const sendRaw = (payload: JsonRpc, agentId?: AgentId) =>
  invoke<void>("send_raw", { payload, agentId: resolveStartAgentId(agentId) });
```

Replace listen helpers:

```ts
export const onAcpMessage = (handler: (msg: JsonRpc) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-message", (e) => {
    handler(acpMessageFromEvent(e.payload).payload as JsonRpc);
  });
export const onAcpRequest = (handler: (msg: JsonRpc) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-request", (e) => {
    handler(acpMessageFromEvent(e.payload).payload as JsonRpc);
  });
export const onAcpStderr = (handler: (line: string) => void): Promise<UnlistenFn> =>
  listen<unknown>("acp-stderr", (e) => {
    const raw = e.payload;
    if (typeof raw === "string") {
      handler(raw);
      return;
    }
    const inner = acpMessageFromEvent(raw).payload;
    handler(typeof inner === "string" ? inner : String(inner ?? ""));
  });
export const onAgentExit = (handler: () => void): Promise<UnlistenFn> =>
  listen("agent-exit", () => handler());
```

- [ ] **Step 3: Confirm focused existing tests still pass**

Run: `npm test -- src/lib/acp-host.test.ts src/lib/acp-event-tag.test.ts`
Expected: PASS

- [ ] **Step 4: Commit** with isolation. `git add` only `src/api.ts`.

```bash
git commit -m "$(cat <<'EOF'
feat: pass AgentId through ACP start, send, and event unwrap

EOF
)"
```

---

### Task 5: Wire AppState pool, start_agent, send_raw, tagged emit

**Files:**
- Modify: `src-tauri/src/lib.rs` (`AppState`, `start_agent`, `stop_agent`, `send_raw`, `stop_agent_inner`, `spawn_reader`)

**Interfaces:**
- Consumes: `agent_host::{AgentId, AgentPool, parse_agent_id_arg, tagged_acp_event, default_spawn_profile}`; `rpc_allowlist::{caps_for_agent, rpc_payload_allowed_for}`
- Produces:
  - `AppState.children: Mutex<AgentPool<AgentSession>>` instead of `session: Mutex<Option<AgentSession>>`
  - `AgentSession` gains `agent_id: AgentId`
  - `start_agent(app, state, agent_id: Option<String>)` — parse id; if that id is already in the pool, stop **only** that child; spawn; insert; return `{ ok, agentId, generation }` (Grok also includes `grok` path string as today)
  - Grok spawn stays `resolve_grok()` + `["agent", "stdio"]` + existing env (`GROK_DISABLE_AUTOUPDATER`, PATH with `~/.grok/bin`)
  - Other ids: `Command::new(profile.command).args(profile.args)` with `HOME` set; on spawn error return `启动 {id} agent 失败: {e}`
  - `stop_agent(state, agent_id: Option<String>)` — `None` drains **all** children; `Some` stops one
  - `send_raw(state, payload, agent_id: Option<String>)` — parse id, `rpc_payload_allowed_for` with `caps_for_agent(id)`, send on that child’s `tx`. Missing child → `agent 未启动`
  - `spawn_reader` takes `agent_id: AgentId`. `acp-message` / `acp-request` emit `tagged_acp_event`. `acp-log` / `acp-stderr` emit `{ agentId, generation, payload: line }`. On exit emit `agent-exit` with `{ agentId, generation, payload: null }`
  - Keep handling `fs/read_text_file` locally as today (un-tagged replies on stdin)

**Isolation:** mandatory for `lib.rs` (same dance as Wave 1/2). After commit, restore the dirty file and re-apply: `children` pool, `agent_id` on commands, tagged emit, `mod agent_host` already present.

Do **not** rewrite `doctor` or session listing.

- [ ] **Step 1: There is no cargo test that spawns grok.** Add a small unit test in `lib.rs` **only if** it does not need a process — prefer testing parse/tag in `agent_host` (already done). After wiring, run:

`cargo test --manifest-path src-tauri/Cargo.toml agent_host rpc_allowlist grok_asset -- --nocapture`

Expected: PASS. The crate must compile.

- [ ] **Step 2: Implement the pool swap**

`AppState`:

```rust
    children: Mutex<AgentPool<AgentSession>>,
```

Default: `children: Mutex::new(AgentPool::new())`.

`AgentSession { child, tx, generation, agent_id: AgentId }`.

`async fn stop_one(state: &AppState, id: AgentId)` — `remove` + kill/wait 2s like today’s `stop_agent_inner`.

`async fn stop_agent_inner(state: &AppState)` — drain all and kill each (today’s restart-all / shutdown).

`start_agent`: parse `agent_id`; `stop_one` for that id; spawn; `insert`.

`send_raw`: parse `agent_id`; allowlist with `caps_for_agent`; `get` that child.

`spawn_reader(..., agent_id: AgentId)`: replace `app.emit("acp-message", &msg)` with `app.emit("acp-message", tagged_acp_event(agent_id, generation, msg))`. Same for request path that currently emits `acp-request`. Stderr: `tagged_acp_event(agent_id, generation, json!(line))`.

Find every `state.session` use and switch to `children`.

- [ ] **Step 3: Compile + unit tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture`
Expected: PASS, `lib.rs` compiles.

- [ ] **Step 4: Commit** isolation, only `src-tauri/src/lib.rs`.

```bash
git commit -m "$(cat <<'EOF'
feat: run one ACP child per AgentId in a process pool

EOF
)"
```

---
