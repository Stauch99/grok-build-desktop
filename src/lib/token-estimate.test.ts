import { describe, expect, it } from "vitest";
import {
  TOKEN_CHIP_MIN_CHARS,
  TOKEN_PER_ATTACHMENT,
  estimateTokens,
  showTokenChip,
} from "./token-estimate";

describe("estimateTokens", () => {
  it("rounds chars/4 up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(2000)).toBe(500);
  });

  it("adds a flat cost per attachment", () => {
    expect(estimateTokens(400, 2)).toBe(100 + 2 * TOKEN_PER_ATTACHMENT);
    expect(estimateTokens(0, 1)).toBe(TOKEN_PER_ATTACHMENT);
  });

  it("clamps negative inputs", () => {
    expect(estimateTokens(-10, -3)).toBe(0);
  });
});

describe("showTokenChip", () => {
  it("only shows once the prompt is long", () => {
    expect(showTokenChip(TOKEN_CHIP_MIN_CHARS)).toBe(false);
    expect(showTokenChip(TOKEN_CHIP_MIN_CHARS + 1)).toBe(true);
  });
});
