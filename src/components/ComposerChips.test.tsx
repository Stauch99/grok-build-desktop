import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { ComposerChips, type ComposerChipsProps } from "./ComposerChips";

const base: ComposerChipsProps = {
  mode: "yolo",
  onMode: () => {},
  modeOpen: false,
  onToggleMode: () => {},
  onArmMode: () => {},
  effort: "xhigh",
  onEffort: () => {},
  effortReady: true,
  effortOptions: ["xhigh"],
  effortOpen: false,
  onToggleEffort: () => {},
  model: "grok-4.6",
  modelOptions: ["grok-4.6"],
  modelOpen: false,
  onToggleModel: () => {},
  onPickModel: () => {},
  onOpenSettings: () => {},
};

function render(extra: Partial<ComposerChipsProps> = {}) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(ComposerChips, { ...base, ...extra }),
    }),
  );
}

describe("ComposerChips mode trigger", () => {
  it("uses a mode icon instead of the always-approve label and shortcut kbd", () => {
    const html = render();
    expect(html).toMatch(/mode-chip yolo[\s\S]*<svg/);
    expect(html).not.toMatch(/mode-chip[^>]*>\s*始终批准/);
    expect(html).toContain("始终批准");
    expect(html).not.toContain("chip-kbd");
    expect(html).not.toContain("⇧Tab");
  });
});
