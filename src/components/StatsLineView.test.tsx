import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { StatsLineView } from "./StatsLineView";

describe("StatsLineView", () => {
  it("shows dotted values and parks the labels on hover", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(StatsLineView, {
          stats: { ttftMs: 300, toksPerSec: 50 },
          sessionTokens: 12400,
        }),
      }),
    );
    expect(html).toContain('data-tip="首字 300ms · 速率 50 tok/s · 已用 12.4k"');
    expect(html).toMatch(/composer-meta-text">300ms · 50 tok\/s · 12\.4k</);
    expect(html).not.toMatch(/composer-meta-text">[^<]*首字/);
  });
});
