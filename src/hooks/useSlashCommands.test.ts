import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    expect(splitSlashAction("dream")).toBe("main-only");
  });

  it("forwards agent slash prompts", () => {
    expect(splitSlashAction(undefined)).toBe("prompt");
  });
});

describe("applySessionModel", () => {
  it("always writes the chip and only /model when a session is live", () => {
    const src = readFileSync(new URL("./useSlashCommands.ts", import.meta.url), "utf8");
    expect(src).toMatch(/modelPickedRef\.current = true/);
    expect(src).toMatch(/shouldSendSessionModelSlash/);
    expect(src).toMatch(/applyModel\(next, \{ skipSessionToast: live \}\)/);
    expect(src).toMatch(/sendPrompt\(`\/model \$\{next\}`\)/);
  });
});
