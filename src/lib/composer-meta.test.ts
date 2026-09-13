import { describe, expect, it } from "vitest";
import { composerMetaHide, composerMetaWidth } from "./composer-meta";

const roomy = {
  available: 680,
  cwd: 140,
  stats: 160,
  ring: 18,
  keep: 280,
};

describe("composerMetaHide", () => {
  it("keeps every slot when the row is wide enough", () => {
    expect(composerMetaHide(roomy)).toEqual({ cwd: false, stats: false, ring: false });
  });

  it("drops the project name first", () => {
    expect(composerMetaHide({ ...roomy, available: 500 })).toEqual({
      cwd: true,
      stats: false,
      ring: false,
    });
  });

  it("then drops first-token and speed", () => {
    expect(composerMetaHide({ ...roomy, available: 400 })).toEqual({
      cwd: true,
      stats: true,
      ring: false,
    });
  });

  it("then drops the context ring; chips stay", () => {
    expect(composerMetaHide({ ...roomy, available: 280 })).toEqual({
      cwd: true,
      stats: true,
      ring: true,
    });
    expect(composerMetaHide({ ...roomy, available: 200 })).toEqual({
      cwd: true,
      stats: true,
      ring: true,
    });
  });

  it("skips empty slots so stats hides before a missing project name", () => {
    expect(composerMetaHide({ ...roomy, cwd: 0, available: 450 })).toEqual({
      cwd: false,
      stats: true,
      ring: false,
    });
  });
});

describe("composerMetaWidth", () => {
  it("adds inner gaps and the column gap between left and right", () => {
    expect(
      composerMetaWidth(
        { available: 0, cwd: 100, stats: 50, ring: 20, keep: 200, gap: 8, columnGap: 12 },
        { cwd: false, stats: false, ring: false },
      ),
    ).toBe(100 + 8 + 50 + 12 + 200 + 8 + 20);
  });
});
