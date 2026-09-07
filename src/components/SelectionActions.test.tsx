import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { SelectionActions } from "./SelectionActions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

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
  it("keeps selection state out of App so drag-select does not reconcile the tree", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    const hook = readFileSync(join(root, "src/hooks/useTextSelection.ts"), "utf8");
    const view = readFileSync(join(root, "src/components/SelectionActions.tsx"), "utf8");
    expect(app).not.toMatch(/useTextSelection/);
    expect(view).toMatch(/useTextSelection\(\)/);
    expect(hook).toMatch(/pointerdown/);
    expect(hook).toMatch(/pointerup/);
    expect(hook).toMatch(/shouldPublishSelectionToolbar/);
    expect(hook).toMatch(/sameSelectionState/);
  });

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
