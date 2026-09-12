import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { DiffView, type DiffViewProps } from "./DiffView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(props: Partial<DiffViewProps> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(DiffView, {
          path: "src/a.ts",
          oldText: "old\n",
          newText: "new\n",
          ...props,
        }),
      }),
    );
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DiffView copy feedback", () => {
  it("swaps to a check + copied label after a successful copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    const btn = container.querySelector('button[aria-label="复制新内容"]')!;
    await click(btn);
    expect(writeText).toHaveBeenCalledWith("new\n");
    expect(container.querySelector('button[aria-label="已复制"]')).toBeTruthy();
  });

  it("shows a failure state when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    const btn = container.querySelector('button[aria-label="复制新内容"]')!;
    await click(btn);
    expect(container.querySelector('button[aria-label="失败"]')).toBeTruthy();
  });
});
