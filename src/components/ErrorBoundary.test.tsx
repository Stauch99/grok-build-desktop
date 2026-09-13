import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): ReactNode {
  throw new Error("boom");
}

let container: HTMLDivElement;
let root: Root;

function mount(locale: "zh" | "en" = "zh") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(ErrorBoundary, { locale, children: createElement(Boom) }));
  });
}

function action(label: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll<HTMLButtonElement>(".set-actions .btn")]
    .find((b) => b.textContent === label);
  if (!btn) throw new Error(`button ${label} not found`);
  return btn;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ErrorBoundary actions", () => {
  it("confirms the diagnostics copy with a transient label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    const btn = action("复制诊断信息");
    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(btn.textContent).toBe("已复制");
  });

  it("flags a failed copy", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    const btn = action("复制诊断信息");
    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    expect(btn.textContent).toBe("失败");
  });

  it("offers a reload action alongside retry and copy", () => {
    mount("en");
    const labels = [...container.querySelectorAll(".set-actions .btn")].map((b) => b.textContent);
    expect(labels).toEqual(["Retry", "Copy diagnostics", "Refresh"]);
  });
});
