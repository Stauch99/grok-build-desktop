import { describe, expect, it, vi } from "vitest";
import { applyChatUpdate, emptyChat } from "./chat";
import {
  foldSessionUpdates,
  scheduleSessionUpdateFlush,
  SESSION_UPDATE_COALESCE_MS,
  shouldClearBusyOnSessionUpdate,
  shouldFlushSessionUpdateNow,
  shouldResumeBusyOnSessionUpdate,
} from "./session-update-batch";

function chunk(text: string) {
  return { update: { sessionUpdate: "agent_message_chunk", content: { text } } };
}

function kind(sessionUpdate: string) {
  return { update: { sessionUpdate } };
}

describe("foldSessionUpdates", () => {
  it("equals applying each update sequentially via applyChatUpdate", () => {
    const prev = emptyChat();
    const batch = [chunk("Hello"), chunk(" world"), chunk("!")];
    const opts = { now: 1 };
    const folded = foldSessionUpdates(prev, batch, opts);
    const sequential = batch.reduce((c, p) => applyChatUpdate(c, p, opts), prev);
    expect(folded).toEqual(sequential);
    expect(folded.items[0]).toMatchObject({ kind: "assistant", text: "Hello world!" });
  });

  it("is a no-op for an empty batch", () => {
    const prev = emptyChat();
    expect(foldSessionUpdates(prev, [])).toBe(prev);
  });
});

describe("shouldClearBusyOnSessionUpdate", () => {
  it("clears busy when the turn ends, not on chunks or compact", () => {
    expect(shouldClearBusyOnSessionUpdate(kind("turn_completed"))).toBe(true);
    expect(shouldClearBusyOnSessionUpdate(chunk("pong"))).toBe(false);
    expect(shouldClearBusyOnSessionUpdate(kind("auto_compact_completed"))).toBe(false);
    expect(shouldClearBusyOnSessionUpdate({ update: { sessionUpdate: "state_update", state: "idle" } })).toBe(
      true,
    );
    expect(shouldClearBusyOnSessionUpdate({ update: { sessionUpdate: "state_update", state: "running" } })).toBe(
      false,
    );
  });

  it("does not idle on turn_completed while a tool is still running", () => {
    const items = [
      { kind: "user" as const, id: "u", text: "go" },
      { kind: "tool" as const, id: "t1", title: "Bash", status: "in_progress" as const },
    ];
    expect(shouldClearBusyOnSessionUpdate(kind("turn_completed"), items)).toBe(false);
    expect(
      shouldClearBusyOnSessionUpdate(kind("turn_completed"), [
        { kind: "user" as const, id: "u", text: "go" },
        { kind: "assistant" as const, id: "a", text: "done" },
      ]),
    ).toBe(true);
    expect(
      shouldClearBusyOnSessionUpdate(kind("turn_completed"), [
        { kind: "user" as const, id: "u", text: "go" },
        { kind: "tool" as const, id: "t1", title: "TaskUpdate", status: "in_progress" as const },
        { kind: "assistant" as const, id: "a", text: "done" },
      ]),
    ).toBe(true);
    expect(
      shouldClearBusyOnSessionUpdate(
        { update: { sessionUpdate: "turn_completed", stop_reason: "cancelled" } },
        [
          { kind: "user" as const, id: "u", text: "go" },
          { kind: "tool" as const, id: "t1", title: "Bash", status: "in_progress" as const },
        ],
      ),
    ).toBe(true);
  });
});

describe("shouldResumeBusyOnSessionUpdate", () => {
  it("re-enters working on live work after the UI had gone idle", () => {
    expect(shouldResumeBusyOnSessionUpdate(chunk("more"))).toBe(true);
    expect(shouldResumeBusyOnSessionUpdate({ update: { sessionUpdate: "state_update", state: "running" } })).toBe(
      true,
    );
    expect(shouldResumeBusyOnSessionUpdate(kind("tool_call"))).toBe(true);
    expect(
      shouldResumeBusyOnSessionUpdate({ update: { sessionUpdate: "tool_call_update", status: "in_progress" } }),
    ).toBe(true);
    expect(
      shouldResumeBusyOnSessionUpdate({ update: { sessionUpdate: "tool_call_update", status: "completed" } }),
    ).toBe(false);
    expect(shouldResumeBusyOnSessionUpdate(kind("turn_completed"))).toBe(false);
  });

  it("does not re-enter working on Grok poll loops or workflow pings", () => {
    expect(
      shouldResumeBusyOnSessionUpdate({
        update: { sessionUpdate: "tool_call", title: "Get task output: 01abc" },
      }),
    ).toBe(false);
    expect(
      shouldResumeBusyOnSessionUpdate({
        update: { sessionUpdate: "tool_call_update", status: "in_progress", title: "Get task output" },
      }),
    ).toBe(false);
    expect(
      shouldResumeBusyOnSessionUpdate(
        { update: { sessionUpdate: "tool_call_update", status: "in_progress", toolCallId: "p1" } },
        [{ kind: "tool", id: "p1", title: "Get task output: 01abc", status: "in_progress" }],
      ),
    ).toBe(false);
    expect(
      shouldResumeBusyOnSessionUpdate({ update: { sessionUpdate: "tool_call", title: "TaskUpdate" } }),
    ).toBe(false);
  });
});

describe("shouldFlushSessionUpdateNow", () => {
  it("flushes turn and compact lifecycle updates immediately", () => {
    expect(shouldFlushSessionUpdateNow(kind("turn_completed"))).toBe(true);
    expect(shouldFlushSessionUpdateNow(kind("auto_compact_started"))).toBe(true);
    expect(shouldFlushSessionUpdateNow(kind("auto_compact_completed"))).toBe(true);
    expect(shouldFlushSessionUpdateNow({ update: { sessionUpdate: "state_update", state: "idle" } })).toBe(true);
  });

  it("keeps token chunks on the animation frame", () => {
    expect(shouldFlushSessionUpdateNow(chunk("x"))).toBe(false);
    expect(shouldFlushSessionUpdateNow(kind("tool_call"))).toBe(false);
  });
});

describe("scheduleSessionUpdateFlush", () => {
  it("coalesces onto a 32ms timeout", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    scheduleSessionUpdateFlush(apply);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(31);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancel skips a scheduled flush", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const cancel = scheduleSessionUpdateFlush(apply);
    cancel();
    vi.advanceTimersByTime(SESSION_UPDATE_COALESCE_MS);
    expect(apply).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
