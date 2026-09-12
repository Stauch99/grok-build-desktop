import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { UserTurn } from "./UserTurn";

function render(text: string) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(UserTurn, {
        text,
        cwd: "/p",
        onCopy: () => {},
        onResend: () => {},
      }),
    }),
  );
}

describe("UserTurn", () => {
  it("hides the injected user-memory block from the chat bubble by default", () => {
    const html = render(
      `<user-memory>\n# You\n- 继续 Source: grok · s0\n</user-memory>\n\n都动`,
    );
    expect(html).toContain("都动");
    expect(html).not.toMatch(/class="md"[^>]*>[\s\S]*user-memory/);
    expect(html).not.toMatch(/class="md"[^>]*>[\s\S]*继续 Source/);
    expect(html).toContain("已加载记忆");
    expect(html).not.toMatch(/<details[^>]*open/);
  });
});

describe("UserTurn edit-resend keys", () => {
  it("submits on ⌘/Ctrl+Enter, cancels on Escape, and guards IME Enter", () => {
    const src = readFileSync(new URL("./UserTurn.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/e\.key === "Escape"[\s\S]*?cancelEdit\(\)/);
    expect(src).toMatch(/e\.metaKey \|\| e\.ctrlKey[\s\S]*?submitEdit\(\)/);
    expect(src).toMatch(/imeBlocksEnter\(/);
    expect(src).toMatch(/applyImeComposition\(imeRef\.current, "start"/);
    expect(src).toMatch(/applyImeComposition\(imeRef\.current, "end"/);
    // Buttons stay localized, no hardcoded zh labels.
    expect(src).not.toMatch(/>\s*发送\s*</);
    expect(src).not.toMatch(/>\s*取消\s*</);
  });
});
