/** Hide the chat fade overlay for one motion window after a scroll tick. */
export function markScrolling(el: HTMLElement, ms = 160): void {
  const shell = el.closest(".chat-shell") ?? el;
  shell.classList.add("is-scrolling");
  const prev = Number(shell.getAttribute("data-scroll-idle") ?? 0);
  clearTimeout(prev);
  const id = setTimeout(() => {
    shell.classList.remove("is-scrolling");
    shell.removeAttribute("data-scroll-idle");
  }, ms);
  shell.setAttribute("data-scroll-idle", String(id));
}

/** Coalesce rapid UI values onto the next animation frame. */
export function scheduleFrameValue<T>(apply: (value: T) => void): (value: T) => void {
  let pending: T | undefined;
  let id = 0;
  return (value: T) => {
    pending = value;
    if (id) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
    id = raf(() => {
      id = 0;
      apply(pending as T);
    });
  };
}
