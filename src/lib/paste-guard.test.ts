import { describe, expect, it } from "vitest";
import { PASTE_GUARD_MAX_CHARS, PASTE_GUARD_MAX_LINES, pasteGuard } from "./paste-guard";

describe("pasteGuard", () => {
  it("treats empty and nullish input as small", () => {
    expect(pasteGuard("")).toEqual({ chars: 0, lines: 0, large: false });
    expect(pasteGuard(null)).toEqual({ chars: 0, lines: 0, large: false });
    expect(pasteGuard(undefined).large).toBe(false);
  });

  it("counts lines for ordinary text without tripping", () => {
    const info = pasteGuard("one\ntwo\nthree");
    expect(info.lines).toBe(3);
    expect(info.chars).toBe(13);
    expect(info.large).toBe(false);
  });

  it("trips just past the line threshold", () => {
    const atLimit = Array.from({ length: PASTE_GUARD_MAX_LINES }, (_, i) => `l${i}`).join("\n");
    expect(pasteGuard(atLimit).large).toBe(false);
    const over = `${atLimit}\nextra`;
    const info = pasteGuard(over);
    expect(info.lines).toBe(PASTE_GUARD_MAX_LINES + 1);
    expect(info.large).toBe(true);
  });

  it("trips on a single huge line past the char threshold", () => {
    const big = "x".repeat(PASTE_GUARD_MAX_CHARS + 1);
    const info = pasteGuard(big);
    expect(info.lines).toBe(1);
    expect(info.large).toBe(true);
    expect(pasteGuard("x".repeat(PASTE_GUARD_MAX_CHARS)).large).toBe(false);
  });
});
