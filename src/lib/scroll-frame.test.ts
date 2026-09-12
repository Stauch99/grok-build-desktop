import { describe, expect, it, vi } from "vitest";
import { markScrolling, scheduleFrameValue } from "./scroll-frame";

describe("scheduleFrameValue", () => {
  it("coalesces to one apply per animation frame", () => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const apply = vi.fn();
    const send = scheduleFrameValue(apply);
    send(false);
    send(true);
    expect(apply).not.toHaveBeenCalled();
    queue[0]?.(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(true);
    vi.unstubAllGlobals();
  });
});

describe("markScrolling", () => {
  it("adds is-scrolling on the chat shell", () => {
    vi.useFakeTimers();
    const classes = new Set<string>();
    const attrs = new Map<string, string>();
    const shell = {
      classList: {
        add: (c: string) => { classes.add(c); },
        remove: (c: string) => { classes.delete(c); },
        contains: (c: string) => classes.has(c),
      },
      closest: () => shell,
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => { attrs.set(k, v); },
      removeAttribute: (k: string) => { attrs.delete(k); },
    } as unknown as HTMLElement;
    markScrolling(shell, 160);
    expect(classes.has("is-scrolling")).toBe(true);
    vi.advanceTimersByTime(160);
    expect(classes.has("is-scrolling")).toBe(false);
    vi.useRealTimers();
  });
});
