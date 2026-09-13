import { describe, expect, it } from "vitest";
import {
  projectHostSession,
  reduceHostSession,
  type HostSessionState,
} from "./host-session-fsm";

describe("reduceHostSession", () => {
  it("walks the happy path idle → ready → streaming → ready", () => {
    let state: HostSessionState = "idle";
    state = reduceHostSession(state, "start_connect");
    expect(state).toBe("connecting");
    state = reduceHostSession(state, "handshake_ok");
    expect(state).toBe("ready");
    state = reduceHostSession(state, "begin_stream");
    expect(state).toBe("streaming");
    state = reduceHostSession(state, "end_stream");
    expect(state).toBe("ready");
  });

  it("crashes any live state to disconnected, and ignores crash from idle", () => {
    expect(reduceHostSession("streaming", "crash")).toBe("disconnected");
    expect(reduceHostSession("awaiting_permission", "crash")).toBe("disconnected");
    expect(reduceHostSession("connecting", "crash")).toBe("disconnected");
    expect(reduceHostSession("idle", "crash")).toBe("idle");
  });

  it("keeps state on illegal transitions instead of throwing", () => {
    expect(reduceHostSession("idle", "begin_stream")).toBe("idle");
    expect(reduceHostSession("ready", "handshake_ok")).toBe("ready");
  });

  it("awaits permission only from streaming", () => {
    expect(reduceHostSession("streaming", "await_permission")).toBe("awaiting_permission");
    expect(reduceHostSession("awaiting_permission", "permission_resolved")).toBe("streaming");
    expect(reduceHostSession("ready", "await_permission")).toBe("ready");
  });
});

describe("projectHostSession", () => {
  it("projects connecting ahead of a previous disconnect", () => {
    expect(
      projectHostSession({
        connecting: true,
        ready: false,
        busy: false,
        pendingPermission: false,
        disconnected: true,
      }),
    ).toBe("connecting");
  });

  it("projects permission, streaming, ready, idle, disconnected", () => {
    expect(
      projectHostSession({
        connecting: false,
        ready: true,
        busy: true,
        pendingPermission: true,
        disconnected: false,
      }),
    ).toBe("awaiting_permission");
    expect(
      projectHostSession({
        connecting: false,
        ready: true,
        busy: true,
        pendingPermission: false,
        disconnected: false,
      }),
    ).toBe("streaming");
    expect(
      projectHostSession({
        connecting: false,
        ready: true,
        busy: false,
        pendingPermission: false,
        disconnected: false,
      }),
    ).toBe("ready");
    expect(
      projectHostSession({
        connecting: false,
        ready: false,
        busy: false,
        pendingPermission: false,
        disconnected: true,
      }),
    ).toBe("disconnected");
    expect(
      projectHostSession({
        connecting: false,
        ready: false,
        busy: false,
        pendingPermission: false,
        disconnected: false,
      }),
    ).toBe("idle");
  });
});
