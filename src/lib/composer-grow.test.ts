import { describe, expect, it } from "vitest";
import { composerHeightPx, growArea } from "./composer-grow";

describe("composerHeightPx", () => {
  it("clamps between 24 and the max", () => {
    expect(composerHeightPx(8)).toBe(24);
    expect(composerHeightPx(80)).toBe(80);
    expect(composerHeightPx(400)).toBe(200);
    expect(composerHeightPx(400, 120)).toBe(120);
  });
});

describe("growArea", () => {
  it("sets height from auto, never through 0", () => {
    const heights: string[] = [];
    const el = {
      style: {
        get height() {
          return heights[heights.length - 1] ?? "";
        },
        set height(v: string) {
          heights.push(v);
        },
      },
      scrollHeight: 88,
    };
    growArea(el as unknown as HTMLTextAreaElement);
    expect(heights).toEqual(["auto", "88px"]);
    expect(heights).not.toContain("0");
    expect(heights).not.toContain("0px");
  });
});
