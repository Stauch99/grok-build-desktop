import { describe, expect, it } from "vitest";
import { dequeue, editQueued, emptyQueue, enqueue, queueLabel, removeQueued, reorderQueue } from "./prompt-queue";

describe("enqueue", () => {
  it("appends with an incrementing id", () => {
    const q = enqueue(enqueue(emptyQueue(), "one"), "two");
    expect(q.items).toEqual([
      { id: 1, text: "one" },
      { id: 2, text: "two" },
    ]);
  });

  it("trims and drops blank text", () => {
    expect(enqueue(emptyQueue(), "  hi  ").items).toEqual([{ id: 1, text: "hi" }]);
    expect(enqueue(emptyQueue(), "   ").items).toEqual([]);
  });

  it("caps the queue at ten", () => {
    let q = emptyQueue();
    for (let i = 0; i < 15; i++) q = enqueue(q, `p${i}`);
    expect(q.items).toHaveLength(10);
    expect(q.items[9].text).toBe("p9");
  });
});

describe("dequeue", () => {
  it("takes the oldest first", () => {
    const q = enqueue(enqueue(emptyQueue(), "one"), "two");
    const { next, rest } = dequeue(q);
    expect(next).toEqual({ id: 1, text: "one" });
    expect(rest.items).toEqual([{ id: 2, text: "two" }]);
  });

  it("returns null when empty", () => {
    const { next, rest } = dequeue(emptyQueue());
    expect(next).toBeNull();
    expect(rest.items).toEqual([]);
  });

  it("keeps handing out fresh ids after draining", () => {
    const q = enqueue(emptyQueue(), "one");
    const drained = dequeue(q).rest;
    expect(enqueue(drained, "two").items).toEqual([{ id: 2, text: "two" }]);
  });
});

describe("removeQueued", () => {
  it("drops just the matching id", () => {
    const q = enqueue(enqueue(emptyQueue(), "one"), "two");
    expect(removeQueued(q, 1).items).toEqual([{ id: 2, text: "two" }]);
  });

  it("is a no-op for an unknown id", () => {
    const q = enqueue(emptyQueue(), "one");
    expect(removeQueued(q, 99).items).toHaveLength(1);
  });
});

describe("reorderQueue", () => {
  it("moves an item to a new index", () => {
    const q = enqueue(enqueue(enqueue(emptyQueue(), "a"), "b"), "c");
    expect(reorderQueue(q, 0, 2).items.map((i) => i.text)).toEqual(["b", "c", "a"]);
    expect(reorderQueue(q, 2, 0).items.map((i) => i.text)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for the same index or a miss", () => {
    const q = enqueue(enqueue(emptyQueue(), "a"), "b");
    expect(reorderQueue(q, 1, 1)).toBe(q);
    expect(reorderQueue(q, -1, 0)).toBe(q);
    expect(reorderQueue(q, 0, 9)).toBe(q);
  });
});

describe("editQueued", () => {
  it("replaces text for a matching id", () => {
    const q = enqueue(enqueue(emptyQueue(), "one"), "two");
    expect(editQueued(q, 1, "  uno  ").items).toEqual([
      { id: 1, text: "uno" },
      { id: 2, text: "two" },
    ]);
  });

  it("drops the item when the new text is blank", () => {
    const q = enqueue(enqueue(emptyQueue(), "one"), "two");
    expect(editQueued(q, 1, "   ").items).toEqual([{ id: 2, text: "two" }]);
  });

  it("is a no-op for an unknown id", () => {
    const q = enqueue(emptyQueue(), "one");
    expect(editQueued(q, 99, "nope")).toBe(q);
  });
});

describe("queueLabel", () => {
  it("is empty when nothing is queued", () => {
    expect(queueLabel(emptyQueue())).toBe("");
  });

  it("counts the queue", () => {
    expect(queueLabel(enqueue(emptyQueue(), "one"))).toBe("已排队 1 条");
  });
});
