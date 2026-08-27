import { describe, expect, it } from "vitest";
import { selectPaneMentionSource, type PaneMentionData } from "./pane-mentions";
describe("pane mention ownership", () => {
  it("never exposes main auxiliary names to a different split cwd", () => {
    const main: PaneMentionData = { cwd: "/main", dirs: ["main-secret"], changes: ["main-only.ts"] };
    expect(selectPaneMentionSource("/split", main)).toEqual({ dirs: [], changes: [] });
  });
  it("returns data only when it belongs to the requested pane cwd", () => {
    const split: PaneMentionData = { cwd: "/split", dirs: ["split-dir"], changes: ["split.ts"] };
    expect(selectPaneMentionSource("/split", split)).toEqual({ dirs: ["split-dir"], changes: ["split.ts"] });
    expect(selectPaneMentionSource("/main", split)).toEqual({ dirs: [], changes: [] });
  });
});
