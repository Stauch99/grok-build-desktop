import { describe, expect, it } from "vitest";
import {
  NONE_SESSION_KEY,
  draftKey,
  getDraft,
  getSessionRailTab,
  isStaleSentDraftChange,
  loadDrafts,
  resumeComposerDraft,
  setDraft,
  setSessionRailTab,
} from "./session-drafts";

describe("loadDrafts", () => {
  it("returns empty map for missing input", () => {
    expect(loadDrafts()).toEqual({});
    expect(loadDrafts(undefined)).toEqual({});
  });

  it("copies string entries and drops empty", () => {
    expect(loadDrafts({ a: "hi", b: "" })).toEqual({ "grok/a": "hi" });
  });

  it("caps long drafts at 20_000", () => {
    const long = "x".repeat(25_000);
    const loaded = loadDrafts({ s: long });
    expect(getDraft(loaded, "s")).toHaveLength(20_000);
  });
});

describe("setDraft", () => {
  it("stores text for a session", () => {
    const next = setDraft({}, "s1", "hello");
    expect(getDraft(next, "s1")).toBe("hello");
  });

  it("caps text at 20_000 characters", () => {
    const long = "y".repeat(25_000);
    const next = setDraft({}, "s1", long);
    expect(getDraft(next, "s1")).toHaveLength(20_000);
    expect(getDraft(next, "s1")).toBe("y".repeat(20_000));
  });

  it("deletes key when text is empty", () => {
    const base = setDraft({}, "s1", "keep me");
    const cleared = setDraft(base, "s1", "");
    expect(cleared).not.toHaveProperty("s1");
    expect(getDraft(cleared, "s1")).toBe("");
  });

  it("deletes key when text is only trimmed-away empty after cap path", () => {
    const base = { s1: "x", s2: "y" };
    expect(setDraft(base, "s2", "")).toEqual({ s1: "x" });
  });

  it("does not mutate the input map", () => {
    const base = { s1: "a" };
    const next = setDraft(base, "s1", "b");
    expect(base.s1).toBe("a");
    expect(getDraft(next, "s1")).toBe("b");
  });
});

describe("getDraft", () => {
  it("returns empty string for missing session", () => {
    expect(getDraft({}, "missing")).toBe("");
  });
});

describe("draft key branding", () => {
  it("maps empty and null session ids to grok/__none__", () => {
    expect(NONE_SESSION_KEY).toBe("__none__");
    expect(draftKey(null)).toBe("grok/__none__");
    expect(draftKey(undefined)).toBe("grok/__none__");
    expect(draftKey("")).toBe("grok/__none__");
    expect(draftKey("__none__")).toBe("grok/__none__");
  });

  it("stores bare and branded ids in the same slot", () => {
    expect(draftKey("s1")).toBe("grok/s1");
    expect(draftKey("grok/s1")).toBe("grok/s1");
    expect(draftKey("claude/x")).toBe("claude/x");
    const next = setDraft({}, "s1", "hello");
    expect(next).toEqual({ "grok/s1": "hello" });
    expect(getDraft(next, "s1")).toBe("hello");
    expect(getDraft(next, "grok/s1")).toBe("hello");
  });

  it("persists no-session drafts under grok/__none__", () => {
    const next = setDraft({}, "", "composer text");
    expect(next).toEqual({ "grok/__none__": "composer text" });
    expect(getDraft(next, "")).toBe("composer text");
    expect(getDraft(next, null)).toBe("composer text");
    expect(getDraft(next, NONE_SESSION_KEY)).toBe("composer text");
  });

  it("loads mixed bare and branded keys into one slot", () => {
    expect(loadDrafts({ "": "old", s1: "keep" })).toEqual({
      "grok/__none__": "old",
      "grok/s1": "keep",
    });
    expect(
      loadDrafts({
        "01a0789f-2f78-7f82-a7b6-ea19ea4415cf": "bare",
        "grok/01a0789f-2f78-7f82-a7b6-ea19ea4415cf": "branded",
      }),
    ).toEqual({ "grok/01a0789f-2f78-7f82-a7b6-ea19ea4415cf": "branded" });
  });

  it("clears both aliases when the sent draft is dropped", () => {
    const mixed = {
      s1: "sent",
      "grok/s1": "sent",
      "grok/other": "keep",
    };
    expect(setDraft(mixed, "s1", "")).toEqual({ "grok/other": "keep" });
  });

  it("clears the __none__ draft when text is empty", () => {
    const base = setDraft({}, NONE_SESSION_KEY, "x");
    expect(setDraft(base, "", "")).toEqual({});
  });
});

describe("session rail tab", () => {
  it("records last tab per session without mutating the map", () => {
    const base = {};
    const next = setSessionRailTab(base, "s1", "changes");
    expect(base).toEqual({});
    expect(getSessionRailTab(next, "s1")).toBe("changes");
    expect(getSessionRailTab(next, "missing")).toBeUndefined();
  });
});

describe("resumeComposerDraft", () => {
  const outgoing = "@/pastes/kyc.xlsx\n再跑一轮";

  it("puts an unlogged send back into the composer", () => {
    const items = [
      { kind: "user", text: "先改 header" },
      { kind: "assistant", text: "改好了" },
    ];
    expect(resumeComposerDraft(items, outgoing)).toBe(outgoing);
  });

  it("returns the stored text when the thread is empty", () => {
    expect(resumeComposerDraft([], outgoing)).toBe(outgoing);
  });

  it("does not restore once the session log already has that user turn", () => {
    const items = [
      { kind: "assistant", text: "改好了" },
      { kind: "user", text: outgoing },
    ];
    expect(resumeComposerDraft(items, outgoing)).toBe("");
  });

  it("treats a wrapped prompt that ends with the original send as logged", () => {
    const items = [{ kind: "user", text: `USER.md\n\n${outgoing}` }];
    expect(resumeComposerDraft(items, outgoing)).toBe("");
  });

  it("does not restore a send the CLI wrapped in user_query tags", () => {
    const items = [{ kind: "user", text: `<user_query>\n${outgoing}\n</user_query>` }];
    expect(resumeComposerDraft(items, outgoing)).toBe("");
  });

  it("leaves an empty stored draft empty", () => {
    expect(resumeComposerDraft([{ kind: "user", text: "hi" }], "")).toBe("");
  });

  it("skips tool items that have no text", () => {
    const items = [
      { kind: "user", text: "先改 header" },
      { kind: "tool" },
      { kind: "assistant", text: "改好了" },
    ];
    expect(resumeComposerDraft(items, outgoing)).toBe(outgoing);
  });
});

describe("isStaleSentDraftChange", () => {
  const sent = "为什么整体的输出速度会这么慢呢？";

  it("ignores a composer onChange that puts the just-sent text back into an empty box", () => {
    expect(isStaleSentDraftChange({ next: sent, lastSent: sent, current: "" })).toBe(true);
  });

  it("lets the user type the same words later after the send echo has settled", () => {
    expect(isStaleSentDraftChange({ next: sent, lastSent: "", current: "" })).toBe(false);
    expect(isStaleSentDraftChange({ next: "other", lastSent: sent, current: "" })).toBe(false);
  });
});
