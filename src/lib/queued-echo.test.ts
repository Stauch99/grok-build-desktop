import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import {
  clearQueuedEchoes,
  hasLocalUserEcho,
  noteQueuedEcho,
  takeQueuedEcho,
  type QueuedEchoes,
} from "./queued-echo";

const user = (id: string, text: string): ChatItem => ({ kind: "user", id, text });
const agent = (id: string, text: string): ChatItem => ({ kind: "assistant", id, text });

describe("queued echo marker", () => {
  it("skips the second echo only while the enqueue-time bubble survives", () => {
    const map: QueuedEchoes = new Map();
    noteQueuedEcho(map, "main/grok/s1", "  咋停了  ");
    // steer/queue echo left a bubble; a turn ran after it
    const items: ChatItem[] = [
      user("u-steer-3", "咋停了"),
      agent("a-4", "还在跑"),
    ];
    expect(takeQueuedEcho(map, "main/grok/s1", "咋停了")).toBe(true);
    expect(hasLocalUserEcho(items, "咋停了")).toBe(true);
    // a second drain of the same text echoes normally again
    expect(takeQueuedEcho(map, "main/grok/s1", "咋停了")).toBe(false);
  });

  it("re-echoes when the session reload dropped the local bubble", () => {
    const map: QueuedEchoes = new Map();
    noteQueuedEcho(map, "main/grok/s1", "继续");
    const reloaded: ChatItem[] = [agent("a-1", "done")];
    expect(takeQueuedEcho(map, "main/grok/s1", "继续")).toBe(true);
    expect(hasLocalUserEcho(reloaded, "继续")).toBe(false);
  });

  it("keeps the marker out of other panes and other sessions", () => {
    const map: QueuedEchoes = new Map();
    noteQueuedEcho(map, "main/grok/a", "hi");
    noteQueuedEcho(map, "pane/split", "hi");
    expect(takeQueuedEcho(map, "main/grok/b", "hi")).toBe(false);
    expect(takeQueuedEcho(map, "pane/other", "hi")).toBe(false);
    expect(takeQueuedEcho(map, "main/grok/a", "hi")).toBe(true);
    expect(takeQueuedEcho(map, "pane/split", "hi")).toBe(true);
  });

  it("does not count transcript user rows as local echoes", () => {
    const items: ChatItem[] = [user("u-7", "hi"), user("u-local-3", "hey")];
    expect(hasLocalUserEcho(items, "hi")).toBe(false);
    expect(hasLocalUserEcho(items, "hey")).toBe(true);
  });

  it("clears a scope when its chat is replaced", () => {
    const map: QueuedEchoes = new Map();
    noteQueuedEcho(map, "pane/split", "x");
    clearQueuedEchoes(map, "pane/split");
    expect(takeQueuedEcho(map, "pane/split", "x")).toBe(false);
  });

  it("counts duplicates so two identical queued sends skip two echoes", () => {
    const map: QueuedEchoes = new Map();
    noteQueuedEcho(map, "main/grok/s1", "go");
    noteQueuedEcho(map, "main/grok/s1", "go");
    expect(takeQueuedEcho(map, "main/grok/s1", "go")).toBe(true);
    expect(takeQueuedEcho(map, "main/grok/s1", "go")).toBe(true);
    expect(takeQueuedEcho(map, "main/grok/s1", "go")).toBe(false);
    expect(map.has("main/grok/s1")).toBe(false);
  });
});
