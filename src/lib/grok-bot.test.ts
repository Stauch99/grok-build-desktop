import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS } from "./accent";
import {
  GROK_BOT_BY_ACCENT,
  GROK_BOT_SPECS,
  grokBotEyes,
  grokBotShape,
  slitEye,
} from "./grok-bot";

describe("grok-bot accents", () => {
  it("gives every accent its own silhouette", () => {
    const shapes = ACCENT_PRESETS.map((row) => grokBotShape(row.id));
    expect(shapes).toEqual(["triangle", "cloud", "pill", "flower", "drop", "circle"]);
    expect(new Set(shapes).size).toBe(6);
    expect(GROK_BOT_BY_ACCENT.blue).toBe("triangle");
  });
});

describe("grok-bot eyes", () => {
  it("narrows vertical capsules into slits", () => {
    const source = GROK_BOT_SPECS.circle.eyes.left;
    const left = slitEye(source);
    expect(left.w).toBeLessThan(source.w * 0.5);
    expect(left.h).toBe(source.h);
    expect(left.w / left.h).toBeLessThan(0.4);
  });

  it("stands horizontal cloud eyes up as vertical slits", () => {
    const source = GROK_BOT_SPECS.cloud.eyes.left;
    const eye = slitEye(source);
    expect(source.w).toBeGreaterThan(source.h);
    expect(eye.h).toBe(source.w);
    expect(eye.w).toBeLessThan(source.h);
    expect(eye.w / eye.h).toBeLessThan(0.4);
  });

  it("keeps capsules centered on the source eye origins", () => {
    const eyes = grokBotEyes("circle");
    expect(eyes.left.cx).toBe(38.7);
    expect(eyes.right.cx).toBe(88.6);
    expect(eyes.left.x).toBeCloseTo(-eyes.left.w / 2, 5);
    expect(eyes.left.rx).toBeCloseTo(eyes.left.w / 2, 5);
  });
});
