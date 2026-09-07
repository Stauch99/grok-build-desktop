import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { SelectionActions } from "./SelectionActions";

function render(state: { text: string; rect: { top: number; left: number; width: number; height: number } } | null) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(SelectionActions, {
        state,
        viewport: { width: 1280, height: 800 },
        locale: "zh",
        onRewrite: () => {},
        onQuote: () => {},
      }),
    }),
  );
}

describe("SelectionActions", () => {
  it("renders nothing without a selection", () => {
    expect(render(null)).toBe("");
  });

  it("renders a toolbar with three actions", () => {
    const html = render({ text: "hello", rect: { top: 300, left: 400, width: 120, height: 18 } });
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("改写");
    expect(html).toContain("引用");
    expect(html).toContain("复制");
  });
});
