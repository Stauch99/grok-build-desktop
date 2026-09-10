import { createElement } from "react";
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
