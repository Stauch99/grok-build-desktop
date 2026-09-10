export function composerHeightPx(scrollHeight: number, max = 200): number {
  return Math.min(Math.max(scrollHeight, 24), max);
}

export function growArea(el: HTMLTextAreaElement | null, max = 200): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${composerHeightPx(el.scrollHeight, max)}px`;
}
