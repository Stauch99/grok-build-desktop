import { describe, expect, it } from "vitest";
import { compatEnabled, toggleCompat } from "./compat";

describe("compat cells", () => {
  it("defaults to on when missing", () => {
    expect(compatEnabled([], "claude", "skills")).toBe(true);
  });

  it("toggles a cell", () => {
    const next = toggleCompat([], "cursor", "hooks", false);
    expect(compatEnabled(next, "cursor", "hooks")).toBe(false);
  });
});
