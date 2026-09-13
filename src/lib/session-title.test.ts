import { describe, expect, it } from "vitest";
import {
  UNTITLED_SESSION_LABEL,
  clipSessionTitle,
  isUntitledSessionTitle,
  titleFromUserText,
} from "./session-title";

describe("isUntitledSessionTitle", () => {
  it("treats blank, uuid, and the unnamed fallback as untitled", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(isUntitledSessionTitle(id, "")).toBe(true);
    expect(isUntitledSessionTitle(id, "  ")).toBe(true);
    expect(isUntitledSessionTitle(id, id)).toBe(true);
    expect(isUntitledSessionTitle("g1", UNTITLED_SESSION_LABEL)).toBe(true);
    expect(isUntitledSessionTitle("g1", "整理桌面")).toBe(false);
  });
});

describe("titleFromUserText", () => {
  it("clips the first user line and ignores slash commands", () => {
    expect(titleFromUserText("  帮我修列表标题  ")).toBe("帮我修列表标题");
    expect(titleFromUserText("字".repeat(80))).toBe("字".repeat(40));
    expect(titleFromUserText("/compact")).toBe("");
    expect(titleFromUserText("   ")).toBe("");
  });
});

describe("clipSessionTitle", () => {
  it("collapses whitespace before clipping", () => {
    expect(clipSessionTitle("  hello   world  \n")).toBe("hello world");
  });
});
