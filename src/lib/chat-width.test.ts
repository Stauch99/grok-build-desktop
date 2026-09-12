import { describe, expect, it } from "vitest";
import {
  CHAT_WIDTH_FILL,
  CHAT_WIDTH_PRESETS,
  DEFAULT_CHAT_WIDTH,
  chatWidthCss,
  normalizeChatWidth,
} from "./chat-width";

describe("chat width presets", () => {
  it("is narrow / medium / wide / fill", () => {
    expect(CHAT_WIDTH_PRESETS.map((p) => [p.id, p.px])).toEqual([
      ["narrow", 560],
      ["medium", 680],
      ["wide", 860],
      ["fill", CHAT_WIDTH_FILL],
    ]);
    expect(DEFAULT_CHAT_WIDTH).toBe(680);
  });

  it("keeps a stored preset", () => {
    expect(normalizeChatWidth(560)).toBe(560);
    expect(normalizeChatWidth(680)).toBe(680);
    expect(normalizeChatWidth(860)).toBe(860);
    expect(normalizeChatWidth(0)).toBe(0);
    expect(normalizeChatWidth("fill")).toBe(0);
  });

  it("snaps leftover slider values onto narrow / medium / wide, not fill", () => {
    expect(normalizeChatWidth(520)).toBe(560);
    expect(normalizeChatWidth(620)).toBe(560);
    expect(normalizeChatWidth(640)).toBe(680);
    expect(normalizeChatWidth(800)).toBe(860);
    expect(normalizeChatWidth(920)).toBe(860);
  });

  it("falls back to medium for junk", () => {
    expect(normalizeChatWidth(undefined)).toBe(680);
    expect(normalizeChatWidth("680")).toBe(680);
    expect(normalizeChatWidth(Number.NaN)).toBe(680);
  });

  it("turns fill into 100% of the middle column", () => {
    expect(chatWidthCss(0)).toBe("100%");
    expect(chatWidthCss(680)).toBe("680px");
    expect(chatWidthCss(520)).toBe("560px");
  });
});
