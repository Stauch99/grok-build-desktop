import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latestAssistantText, publishLiveText } from "./live-region";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("latestAssistantText", () => {
  it("returns the last assistant message", () => {
    expect(
      latestAssistantText([
        { kind: "user", text: "hi" },
        { kind: "assistant", text: "one" },
        { kind: "tool" },
        { kind: "assistant", text: "two" },
      ]),
    ).toBe("two");
  });

  it("returns empty when there is no assistant text", () => {
    expect(latestAssistantText([{ kind: "user", text: "hi" }])).toBe("");
  });
});

describe("publishLiveText", () => {
  it("publishes immediately the first time", () => {
    expect(publishLiveText({ announced: "", lastAt: 0 }, "hello", 1000)).toEqual({
      announced: "hello",
      lastAt: 1000,
    });
  });

  it("throttles updates inside 1s", () => {
    const first = publishLiveText({ announced: "", lastAt: 0 }, "a", 1000);
    const second = publishLiveText(first, "ab", 1999);
    expect(second.announced).toBe("a");
    expect(second.lastAt).toBe(1000);
  });

  it("publishes again after 1s", () => {
    const first = publishLiveText({ announced: "", lastAt: 0 }, "a", 1000);
    const second = publishLiveText(first, "ab", 2000);
    expect(second).toEqual({ announced: "ab", lastAt: 2000 });
  });

  it("flushes the latest text immediately when asked", () => {
    const first = publishLiveText({ announced: "", lastAt: 0 }, "a", 1000);
    const second = publishLiveText(first, "done", 1100, { flush: true });
    expect(second.announced).toBe("done");
  });
});

describe("usage contrast tokens", () => {
  it("defines AA pairs for light and dark chips", () => {
    const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
    expect(tokens).toMatch(/--usage-fg:\s*#1a1a1a/);
    expect(tokens).toMatch(/--usage-bg:\s*#e8e4da/);
    expect(tokens).toMatch(/--usage-fg:\s*#f4f0e8/);
    expect(tokens).toMatch(/--usage-bg:\s*#3a3530/);
  });
});
