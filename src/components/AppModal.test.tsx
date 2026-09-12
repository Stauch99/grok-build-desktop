import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppModal, type AppModalProps } from "./AppModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(props: Partial<AppModalProps> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(AppModal, {
        open: true,
        title: "Discard changes?",
        body: "This cannot be undone.",
        confirmLabel: "Discard",
        onConfirm: () => {},
        onCancel: () => {},
        ...props,
      }),
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppModal initial focus", () => {
  it("focuses the confirm button by default", () => {
    mount();
    expect(document.activeElement?.textContent).toBe("Discard");
  });

  it("focuses the cancel button for destructive confirms", () => {
    mount({ danger: true });
    expect(document.activeElement?.textContent).toBe("取消");
    expect(document.activeElement?.className).toBe("btn");
  });
});
