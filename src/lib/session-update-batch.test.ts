import { describe, expect, it, vi } from "vitest";
import { applyChatUpdate, emptyChat } from "./chat";
import {
  foldSessionUpdates,
  scheduleSessionUpdateFlush,
  shouldClearBusyOnSessionUpdate,
  shouldFlushSessionUpdateNow,
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
  });
});

describe("shouldFlushSessionUpdateNow", () => {
  it("flushes turn and compact lifecycle updates immediately", () => {
    expect(shouldFlushSessionUpdateNow(kind("turn_completed"))).toBe(true);
    expect(shouldFlushSessionUpdateNow(kind("auto_compact_started"))).toBe(true);
    expect(shouldFlushSessionUpdateNow(kind("auto_compact_completed"))).toBe(true);
  });

  it("keeps token chunks on the animation frame", () => {
    expect(shouldFlushSessionUpdateNow(chunk("x"))).toBe(false);
    expect(shouldFlushSessionUpdateNow(kind("tool_call"))).toBe(false);
  });
});

describe("scheduleSessionUpdateFlush", () => {
  it("uses requestAnimationFrame when it exists", () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => {
      frames.push(cb);
      return 7;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const apply = vi.fn();
    scheduleSessionUpdateFlush(apply);
    expect(apply).not.toHaveBeenCalled();
    expect(raf).toHaveBeenCalledTimes(1);
    frames[0](0);
    expect(apply).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("falls back to queueMicrotask when rAF is missing", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const apply = vi.fn();
    scheduleSessionUpdateFlush(apply);
    expect(apply).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(apply).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("cancel skips a scheduled flush", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const apply = vi.fn();
    const cancel = scheduleSessionUpdateFlush(apply);
    cancel();
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
