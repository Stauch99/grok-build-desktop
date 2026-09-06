import { describe, expect, it } from "vitest";
import { crashReportText } from "./crash-report";

describe("crashReportText", () => {
  it("joins the error stack with the component stack for copy", () => {
    const err = new Error("boom");
    const text = crashReportText(err, "\n    in App");
    expect(text).toContain("boom");
    expect(text).toContain("in App");
  });
});
