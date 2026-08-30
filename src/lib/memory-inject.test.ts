import { describe, expect, it } from "vitest";
import { compactUserMd, wrapFirstPrompt } from "./memory-inject";

describe("compactUserMd", () => {
  it("keeps short files", () => {
    expect(compactUserMd("# You\n- likes tests\n")).toBe("# You\n- likes tests\n");
  });

  it("cuts on a heading before the limit", () => {
    const a = `# A\n${"x".repeat(80)}\n\n`;
    const b = `# B\n${"y".repeat(80)}\n`;
    const out = compactUserMd(a + b, 120);
    expect(out.startsWith("# A")).toBe(true);
    expect(out.includes("# B")).toBe(false);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});

describe("wrapFirstPrompt", () => {
  const md = "# You\n- prefers TypeScript\n";
  it("prepends once when inject is on", () => {
    const r = wrapFirstPrompt({
      sessionId: "s1",
      alreadyInjected: false,
      injectOn: true,
      userMd: md,
      userText: "hello",
    });
    expect(r.injected).toBe(true);
    expect(r.text.endsWith("hello")).toBe(true);
    expect(r.text.includes("prefers TypeScript")).toBe(true);
  });

  it("sends the original text when off, empty, or already injected", () => {
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: true, injectOn: true, userMd: md, userText: "hello" })).toEqual({
      text: "hello",
      injected: false,
    });
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: false, injectOn: false, userMd: md, userText: "hello" }).injected).toBe(false);
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: false, injectOn: true, userMd: "   ", userText: "hello" })).toEqual({
      text: "hello",
      injected: false,
    });
  });
});
