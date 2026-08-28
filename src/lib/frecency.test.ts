import { describe, expect, it } from "vitest";
import {
  PALETTE_FRECENCY_KEY,
  bumpFrecency,
  frecencyScore,
  loadPaletteFrecency,
  recordPaletteUse,
} from "./frecency";

const DAY = 86_400_000;

describe("frecencyScore", () => {
  it("is uses when lastAt equals now", () => {
    expect(frecencyScore(2, 1_000, 1_000)).toBe(2);
  });

  it("halves after one day", () => {
    expect(frecencyScore(2, 0, DAY)).toBe(1);
  });

  it("is zero when never used", () => {
    expect(frecencyScore(0, 0, DAY)).toBe(0);
  });
});

describe("bumpFrecency", () => {
  it("increments uses and stamps lastAt", () => {
    const next = bumpFrecency({ a: { uses: 1, lastAt: 10 } }, "a", 99);
    expect(next).toEqual({ a: { uses: 2, lastAt: 99 } });
  });

  it("starts a new id at one use", () => {
    expect(bumpFrecency({}, "act:theme", 50)).toEqual({ "act:theme": { uses: 1, lastAt: 50 } });
  });
});

describe("palette frecency storage", () => {
  it("reads grok.palette.frecency JSON", () => {
    const storage = {
      data: { [PALETTE_FRECENCY_KEY]: JSON.stringify({ "act:new-chat": { uses: 3, lastAt: 8 } }) } as Record<string, string>,
      getItem(key: string) {
        return this.data[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.data[key] = value;
      },
    };
    expect(loadPaletteFrecency(storage)).toEqual({ "act:new-chat": { uses: 3, lastAt: 8 } });
    const next = recordPaletteUse("act:new-chat", 20, storage);
    expect(next["act:new-chat"]).toEqual({ uses: 4, lastAt: 20 });
    expect(JSON.parse(storage.data[PALETTE_FRECENCY_KEY])).toEqual(next);
  });

  it("treats missing or junk JSON as empty", () => {
    expect(loadPaletteFrecency({ getItem: () => null })).toEqual({});
    expect(loadPaletteFrecency({ getItem: () => "nope" })).toEqual({});
  });
});
