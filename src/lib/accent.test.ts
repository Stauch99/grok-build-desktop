import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  accentHex,
  applyAccent,
  normalizeAccentId,
} from "./accent";

describe("accent palette", () => {
  it("offers six logo-sampled colors and defaults to blue", () => {
    expect(ACCENT_PRESETS.map((row) => row.id)).toEqual([
      "blue",
      "orange",
      "green",
      "purple",
      "pink",
      "teal",
    ]);
    expect(DEFAULT_ACCENT_ID).toBe("blue");
    expect(accentHex("blue")).toBe("#0078FC");
    expect(accentHex("orange")).toBe("#FC7800");
    expect(accentHex("green")).toBe("#00C06C");
    expect(accentHex("purple")).toBe("#6C48FC");
    expect(accentHex("pink")).toBe("#F0549C");
    expect(accentHex("teal")).toBe("#00C0CC");
  });

  it("normalizes unknown ids back to blue", () => {
    expect(normalizeAccentId("pink")).toBe("pink");
    expect(normalizeAccentId(undefined)).toBe("blue");
    expect(normalizeAccentId("nope")).toBe("blue");
    expect(accentHex("garbage")).toBe("#0078FC");
  });

  it("writes --brand onto a document root", () => {
    const props: Record<string, string> = {};
    const target = {
      style: { setProperty(name: string, value: string) { props[name] = value; } },
      dataset: {} as Record<string, string>,
    };
    expect(applyAccent(target, "teal")).toBe("teal");
    expect(props["--brand"]).toBe("#00C0CC");
    expect(target.dataset.accent).toBe("teal");
  });
});
