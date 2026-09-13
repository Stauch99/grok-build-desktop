import { describe, expect, it } from "vitest";
import { chromeForStatus, countNeedsYou } from "./session-badge";

describe("countNeedsYou", () => {
  it("counts only sessions that need user input", () => {
    expect(countNeedsYou(["needs-you", "done", "idle", "needs-you", "error", "working"])).toBe(2);
  });

  it("does not treat completed runs as badge counts", () => {
    expect(countNeedsYou(["done", "done", "idle"])).toBe(0);
  });
});

describe("chromeForStatus", () => {
  it("uses a numeric badge only when the session needs you", () => {
    expect(chromeForStatus("needs-you")).toBe("count");
  });

  it("marks completed runs with an idle dot", () => {
    expect(chromeForStatus("done")).toBe("idle-dot");
  });

  it("leaves working and idle rows without a badge", () => {
    expect(chromeForStatus("working")).toBe("none");
    expect(chromeForStatus("idle")).toBe("none");
    expect(chromeForStatus("error")).toBe("none");
  });
});
