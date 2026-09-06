import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { ChatRow } from "./Thread";

function renderAssistant(showCopy = true) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(ChatRow, {
        item: { kind: "assistant", id: "a1", text: "hello `pkg`" },
        dark: false,
        showCopy,
      }),
    }),
  );
}

describe("ChatRow assistant copy", () => {
  it("keeps the copy control in the markup while the turn is still streaming", () => {
    const html = renderAssistant(false);
    expect(html).toContain('class="actions"');
    expect(html).toContain('aria-label="复制"');
  });
});
