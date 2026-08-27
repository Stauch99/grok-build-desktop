/** Meta (macOS) or Ctrl — platform-agnostic mod key. */
export function isMod(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey;
}

/** Digit 1–9 from key or KeyboardEvent.code (`Digit1`…). */
export function digitFromEvent(e: { key: string; code?: string }): number | null {
  if (/^[1-9]$/.test(e.key)) return Number(e.key);
  const m = e.code ? /^Digit([1-9])$/.exec(e.code) : null;
  return m ? Number(m[1]) : null;
}

/** Ctrl+Tab (not Meta+Tab) — MRU session switch. */
export function isMruSwitch(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey && !e.metaKey && e.key === "Tab";
}
