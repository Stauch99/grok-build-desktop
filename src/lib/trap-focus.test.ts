import { describe, expect, it } from "vitest";
import { trapFocus } from "./trap-focus";

function mockControl(id: string) {
  const el = {
    id,
    focused: false,
    tabIndex: 0,
    focus() {
      el.focused = true;
    },
  };
  return el;
}

function tabEvent(target: unknown, shiftKey = false) {
  let prevented = false;
  return {
    key: "Tab",
    shiftKey,
    target,
    preventDefault() {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  };
}

function containerOf(...els: ReturnType<typeof mockControl>[]) {
  return {
    querySelectorAll() {
      return els;
    },
  };
}

describe("trapFocus", () => {
  it("cycles Tab from the last control to the first", () => {
    const a = mockControl("a");
    const b = mockControl("b");
    const c = mockControl("c");
    const event = tabEvent(c);
    trapFocus(containerOf(a, b, c) as unknown as HTMLElement, event as unknown as KeyboardEvent);
    expect(event.defaultPrevented).toBe(true);
    expect(a.focused).toBe(true);
    expect(c.focused).toBe(false);
  });

  it("cycles Shift+Tab from the first control to the last", () => {
    const a = mockControl("a");
    const b = mockControl("b");
    const c = mockControl("c");
    const event = tabEvent(a, true);
    trapFocus(containerOf(a, b, c) as unknown as HTMLElement, event as unknown as KeyboardEvent);
    expect(event.defaultPrevented).toBe(true);
    expect(c.focused).toBe(true);
    expect(a.focused).toBe(false);
  });

  it("leaves mid-list Tab alone so the browser can move", () => {
    const a = mockControl("a");
    const b = mockControl("b");
    const c = mockControl("c");
    const event = tabEvent(b);
    trapFocus(containerOf(a, b, c) as unknown as HTMLElement, event as unknown as KeyboardEvent);
    expect(event.defaultPrevented).toBe(false);
    expect(a.focused).toBe(false);
    expect(c.focused).toBe(false);
  });

  it("ignores keys other than Tab", () => {
    const a = mockControl("a");
    const event = { ...tabEvent(a), key: "Escape" };
    trapFocus(containerOf(a) as unknown as HTMLElement, event as unknown as KeyboardEvent);
    expect(event.defaultPrevented).toBe(false);
    expect(a.focused).toBe(false);
  });
});
