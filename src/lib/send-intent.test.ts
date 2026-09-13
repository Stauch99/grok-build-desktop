import { describe, expect, it } from "vitest";
import { composerSendIntentHint, resolveSendIntent } from "./send-intent";

describe("resolveSendIntent", () => {
  const base = {
    host: "ready" as const,
    hasBody: true,
    steerByDefault: false,
    queueLength: 0,
  };

  it("sends immediately when ready with a body", () => {
    expect(resolveSendIntent(base)).toEqual({
      kind: "send_now",
      enqueue: false,
    });
  });

  it("queues or steers while streaming, matching the composer setting", () => {
    expect(resolveSendIntent({ ...base, host: "streaming" })).toMatchObject({
      kind: "enqueue",
      enqueue: true,
      bannerKey: "composer.hintQueue",
    });
    expect(resolveSendIntent({ ...base, host: "streaming", steerByDefault: true })).toMatchObject({
      kind: "steer",
      enqueue: false,
      bannerKey: "composer.hintSteer",
    });
  });

  it("never enqueues while a permission card is up or the body is empty", () => {
    expect(resolveSendIntent({ ...base, host: "awaiting_permission" })).toMatchObject({
      kind: "blocked_permission",
      enqueue: false,
    });
    expect(resolveSendIntent({ ...base, hasBody: false })).toMatchObject({
      kind: "blocked_empty",
      enqueue: false,
    });
  });

  it("blocks enqueue when the queue is full", () => {
    expect(resolveSendIntent({ ...base, host: "streaming", queueLength: 10 })).toMatchObject({
      kind: "blocked_queue_full",
      enqueue: false,
      bannerKey: "toast.queueFull",
    });
  });

  it("keeps a busy extra pane as streaming even while main is connecting", () => {
    expect(
      composerSendIntentHint({
        connecting: true,
        ready: false,
        busy: true,
        pendingPermission: false,
        hasBody: false,
        steerByDefault: false,
        queueLength: 0,
        locale: "zh",
      }),
    ).toBe("忙碌时回车会排队");
  });
});
