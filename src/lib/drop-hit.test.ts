import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dropPointHitsZone, pointInRect } from "./drop-hit";

const composer = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/Composer.tsx"),
  "utf8",
);

const composerRect = { left: 200, top: 700, right: 900, bottom: 860 };
const paneRect = { left: 200, top: 52, right: 900, bottom: 860 };

describe("dropPointHitsZone", () => {
  it("treats macOS logical points as CSS pixels even when DPR is 2", () => {
    expect(dropPointHitsZone(400, 780, composerRect, 2)).toBe(true);
    expect(pointInRect(400 / 2, 780 / 2, composerRect)).toBe(false);
  });

  it("also accepts physical pixels that only match after dividing by DPR", () => {
    expect(dropPointHitsZone(800, 1560, composerRect, 2)).toBe(true);
  });

  it("lights the overlay when the cursor is over the chat pane, not only the input", () => {
    expect(dropPointHitsZone(400, 240, paneRect, 2)).toBe(true);
    expect(pointInRect(400, 240, composerRect)).toBe(false);
  });

  it("rejects points that miss in both coordinate spaces", () => {
    expect(dropPointHitsZone(40, 20, composerRect, 2)).toBe(false);
    expect(dropPointHitsZone(80, 40, composerRect, 2)).toBe(false);
  });

  it("does not scale when DPR is 1", () => {
    expect(dropPointHitsZone(400, 780, composerRect, 1)).toBe(true);
    expect(dropPointHitsZone(800, 1560, composerRect, 1)).toBe(false);
  });
});

describe("composer drop overlay wiring", () => {
  it("hit-tests Tauri coords without dividing by DPR first", () => {
    expect(composer).toContain("dropPointHitsZone");
    expect(composer).not.toMatch(/position\.x\s*\/\s*scale/);
    expect(composer).not.toMatch(/position\.y\s*\/\s*scale/);
  });

  it("uses the conversation column as the drop zone and portals the hint onto it", () => {
    expect(composer).toContain('closest(".work-col")');
    expect(composer).toContain('closest(".pane")');
    expect(composer).toContain("createPortal");
    expect(composer).toContain('t("composer.drop")');
  });
});
