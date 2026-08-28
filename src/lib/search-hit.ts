export const SEARCH_HIT_MS = 2400;

/** Poll `querySelector` on animation frames until a node exists or `timeoutMs` elapses. */
export function waitForSelector(
  root: ParentNode | null | undefined,
  selector: string,
  timeoutMs: number,
): Promise<Element | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (node: Element | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(node);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const tick = () => {
      if (done) return;
      const found = root?.querySelector(selector) ?? null;
      if (found) {
        finish(found);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Flash `search-hit` on `#turn-{id}` or `#msg-{id}` inside `el` for 2.4s. */
export function applySearchHit(el: ParentNode | null | undefined, id: string): () => void {
  const hit = el?.querySelector(`#turn-${id}, #msg-${id}`);
  hit?.classList.add("search-hit");
  const t = setTimeout(() => hit?.classList.remove("search-hit"), SEARCH_HIT_MS);
  return () => clearTimeout(t);
}
