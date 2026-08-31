import { describe, expect, it } from "vitest";
import { CHAT_FONT_PRESETS, DEFAULT_CHAT_FONT_SIZE, normalizeChatFontSize } from "./chat-font";

describe("chat font presets", () => {
  it("is smaller / medium / regular at 14, 15, 17", () => {
    expect(CHAT_FONT_PRESETS.map((p) => [p.id, p.px])).toEqual([
      ["small", 14],
      ["medium", 15],
      ["regular", 17],
    ]);
    expect(DEFAULT_CHAT_FONT_SIZE).toBe(17);
  });

  it("keeps a stored preset", () => {
    expect(normalizeChatFontSize(14)).toBe(14);
    expect(normalizeChatFontSize(15)).toBe(15);
    expect(normalizeChatFontSize(17)).toBe(17);
  });

  it("snaps leftover slider values onto the nearest preset", () => {
    expect(normalizeChatFontSize(16)).toBe(15);
    expect(normalizeChatFontSize(18)).toBe(17);
    expect(normalizeChatFontSize(20)).toBe(17);
    expect(normalizeChatFontSize(13)).toBe(14);
  });

  it("falls back to regular for junk", () => {
    expect(normalizeChatFontSize(undefined)).toBe(17);
    expect(normalizeChatFontSize("17")).toBe(17);
    expect(normalizeChatFontSize(Number.NaN)).toBe(17);
  });
});
