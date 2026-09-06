import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { AgentChip } from "./AgentChip";

function render() {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(AgentChip, {
        hasOpenSession: false,
        value: "grok",
        onChange: () => {},
        open: false,
        onToggle: () => {},
      }),
    }),
  );
}

describe("AgentChip trigger", () => {
  it("shows the brand mark instead of the CLI name", () => {
    const html = render();
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/agent-chip[^>]*>[^<]*Grok/);
    expect(html).toContain("切换 CLI");
    expect(html).toContain('data-tip="Grok"');
  });
});
