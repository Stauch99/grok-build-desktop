import { describe, expect, it } from "vitest";
import { recapIdentity, shouldShowSessionRecap } from "./session-recap";

describe("recapIdentity", () => {
  it("prefers the grok prompt id so a new turn reopens the card", () => {
    expect(recapIdentity("p1", "五套按用途落地")).toBe("p1");
    expect(recapIdentity("p2", "五套按用途落地")).toBe("p2");
  });

  it("falls back to the recap text when grok omitted a prompt id", () => {
    expect(recapIdentity(null, "  整理文件夹  ")).toBe("整理文件夹");
    expect(recapIdentity("", "")).toBe("");
  });
});

describe("shouldShowSessionRecap", () => {
  it("hides until grok has written a last-turn recap", () => {
    expect(shouldShowSessionRecap({ text: null, identity: "", dismissed: null })).toBe(false);
    expect(shouldShowSessionRecap({ text: "  ", identity: "x", dismissed: null })).toBe(false);
  });

  it("shows a loaded recap until the user dismisses that identity", () => {
    expect(
      shouldShowSessionRecap({
        text: "五套按用途落地；标准材料仍作终版出口",
        identity: "p1",
        dismissed: null,
      }),
    ).toBe(true);
    expect(
      shouldShowSessionRecap({
        text: "五套按用途落地；标准材料仍作终版出口",
        identity: "p1",
        dismissed: "p1",
      }),
    ).toBe(false);
  });

  it("shows again when the next turn writes a new recap", () => {
    expect(
      shouldShowSessionRecap({
        text: "下一轮摘要",
        identity: "p2",
        dismissed: "p1",
      }),
    ).toBe(true);
  });
});
