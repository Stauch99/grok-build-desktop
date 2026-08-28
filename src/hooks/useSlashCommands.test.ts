import { describe, expect, it } from "vitest";
import { splitSlashAction } from "./useSlashCommands";

describe("splitSlashAction", () => {
  it("maps mode slashes onto the split pane", () => {
    expect(splitSlashAction("plan")).toBe("mode-plan");
    expect(splitSlashAction("yolo")).toBe("mode-yolo");
    expect(splitSlashAction("auto")).toBe("mode-agent");
  });

  it("keeps other local commands on the main pane", () => {
    expect(splitSlashAction("settings")).toBe("main-only");
    expect(splitSlashAction("rename")).toBe("main-only");
  });

  it("forwards agent slash prompts", () => {
    expect(splitSlashAction(undefined)).toBe("prompt");
  });
});
