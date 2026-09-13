import { beforeEach, describe, expect, it } from "vitest";
import {
  NOTIFY_CENTER_CAP,
  clearNotifyCenter,
  markAllNotifyRead,
  markNotifyRead,
  notifyCenterSnapshot,
  notifyUnread,
  pushNotifyEntry,
  resetNotifyCenter,
  subscribeNotifyCenter,
} from "./notify-center";

beforeEach(() => resetNotifyCenter());

describe("notify-center ring buffer", () => {
  it("prepends newest entries and caps at NOTIFY_CENTER_CAP", () => {
    for (let i = 0; i < NOTIFY_CENTER_CAP + 5; i++) {
      pushNotifyEntry({ kind: "done", title: `t${i}`, body: "" });
    }
    const { entries } = notifyCenterSnapshot();
    expect(entries.length).toBe(NOTIFY_CENTER_CAP);
    expect(entries[0].title).toBe(`t${NOTIFY_CENTER_CAP + 4}`);
    expect(entries.at(-1)?.title).toBe("t5");
  });

  it("tracks unread until entries are marked read", () => {
    const a = pushNotifyEntry({ kind: "needs-you", title: "a", body: "" });
    pushNotifyEntry({ kind: "done", title: "b", body: "" });
    expect(notifyUnread()).toBe(2);
    markNotifyRead(a.id);
    expect(notifyUnread()).toBe(1);
    markAllNotifyRead();
    expect(notifyUnread()).toBe(0);
  });

  it("keeps sessionId on the entry", () => {
    pushNotifyEntry({ kind: "done", title: "t", body: "b", sessionId: "s1" });
    expect(notifyCenterSnapshot().entries[0].sessionId).toBe("s1");
  });

  it("notifies subscribers on push, read, and clear", () => {
    let ticks = 0;
    const off = subscribeNotifyCenter(() => ticks++);
    pushNotifyEntry({ kind: "done", title: "t", body: "" });
    const id = notifyCenterSnapshot().entries[0].id;
    markNotifyRead(id);
    markNotifyRead(id); // already read — no emit
    clearNotifyCenter();
    clearNotifyCenter(); // empty — no emit
    off();
    pushNotifyEntry({ kind: "done", title: "t2", body: "" });
    expect(ticks).toBe(3);
    expect(notifyCenterSnapshot().entries.length).toBe(1);
  });

  it("clears entries on clearNotifyCenter", () => {
    pushNotifyEntry({ kind: "error", title: "x", body: "" });
    clearNotifyCenter();
    expect(notifyCenterSnapshot().entries).toEqual([]);
    expect(notifyUnread()).toBe(0);
  });
});
