import { describe, expect, it } from "vitest";
import { cancelPending, commitPending, omitPending, queuePending } from "./undo-toast";

const a = { key: "a", payload: { id: "a" } };
const b = { key: "b", payload: { id: "b" } };

describe("queuePending", () => {
  it("holds the next payload and has nothing to flush when idle", () => {
    expect(queuePending(null, a)).toEqual({ pending: a, displaced: null });
  });

  it("displaces a different pending payload so the caller can commit it", () => {
    expect(queuePending(a, b)).toEqual({ pending: b, displaced: a.payload });
  });

  it("replaces the same key without displacing", () => {
    const again = { key: "a", payload: { id: "a", n: 2 } };
    expect(queuePending(a, again)).toEqual({ pending: again, displaced: null });
  });
});

describe("cancelPending", () => {
  it("restores the payload when the key matches", () => {
    expect(cancelPending(a, "a")).toEqual({ pending: null, restored: a.payload });
  });

  it("leaves a different pending untouched", () => {
    expect(cancelPending(a, "b")).toEqual({ pending: a, restored: null });
  });

  it("is a no-op when nothing is pending", () => {
    expect(cancelPending(null, "a")).toEqual({ pending: null, restored: null });
  });
});

describe("commitPending", () => {
  it("takes the payload when the key matches", () => {
    expect(commitPending(a, "a")).toEqual({ pending: null, committed: a.payload });
  });

  it("takes the current payload when no key is given", () => {
    expect(commitPending(a)).toEqual({ pending: null, committed: a.payload });
  });

  it("does not commit a mismatched key", () => {
    expect(commitPending(a, "b")).toEqual({ pending: a, committed: null });
  });

  it("is a no-op when nothing is pending", () => {
    expect(commitPending(null, "a")).toEqual({ pending: null, committed: null });
  });
});

describe("omitPending", () => {
  it("hides the pending id from a session list", () => {
    expect(omitPending([{ id: "a" }, { id: "b" }], "a").map((x) => x.id)).toEqual(["b"]);
  });

  it("returns the list unchanged when nothing is pending", () => {
    const list = [{ id: "a" }];
    expect(omitPending(list, null)).toBe(list);
  });
});
