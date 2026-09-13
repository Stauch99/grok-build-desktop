/**
 * Module-level pub/sub for pushing draft text into a composer. Each composer
 * registers when its textarea gains focus; the most recently focused one is
 * the target, with earlier registrations kept as a fallback stack so the
 * previously focused composer takes over when the current one unmounts.
 */

export type ComposerInboxHandler = (text: string) => void;

const stack: ComposerInboxHandler[] = [];

/**
 * Register `handler` as the current draft target. Re-registering the same
 * handler just moves it back to the top of the stack. Returns an unregister
 * function; call it on unmount so the previously focused composer wins again.
 */
export function registerComposerInbox(handler: ComposerInboxHandler): () => void {
  const existing = stack.lastIndexOf(handler);
  if (existing >= 0) stack.splice(existing, 1);
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Deliver `text` to the most recently registered composer. Returns false when
 * no composer has ever been focused (or all have unmounted).
 */
export function pushComposerDraft(text: string): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top(text);
  return true;
}

/** How many composers are currently registered. Test/debug aid. */
export function composerInboxDepth(): number {
  return stack.length;
}

/** Drop every registration. Tests only — the app never clears mid-session. */
export function resetComposerInbox(): void {
  stack.length = 0;
}
