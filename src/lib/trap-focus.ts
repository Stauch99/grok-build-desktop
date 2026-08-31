const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isTabStop(el: Element): el is HTMLElement {
  if (typeof (el as HTMLElement).focus !== "function") return false;
  const node = el as HTMLElement;
  if (typeof node.tabIndex === "number" && node.tabIndex < 0) return false;
  if (typeof node.closest === "function") {
    if (node.closest("[inert], [aria-hidden='true']")) return false;
  }
  return true;
}

/** Focusable controls inside a dialog or menu, in DOM order. */
export function focusables(container: ParentNode | { querySelectorAll(sel: string): ArrayLike<Element> }): HTMLElement[] {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isTabStop);
}

/**
 * Keep Tab inside `container`. At the edges, wrap to the other end.
 * Mid-list Tab is left to the browser.
 */
export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const nodes = focusables(container);
  if (nodes.length === 0) {
    event.preventDefault();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const current = event.target;
  if (event.shiftKey) {
    if (current === first || !nodes.includes(current as HTMLElement)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (current === last || !nodes.includes(current as HTMLElement)) {
    event.preventDefault();
    first.focus();
  }
}
