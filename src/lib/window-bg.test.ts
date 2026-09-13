import { describe, expect, it } from "vitest";
import { windowBackgroundCss } from "./window-bg";

describe("windowBackgroundCss", () => {
  it("matches the default paper tokens", () => {
    expect(windowBackgroundCss("light")).toBe("hsl(30 14.3% 97.3%)");
    expect(windowBackgroundCss("dark")).toBe("hsl(30 5% 7%)");
  });
});
