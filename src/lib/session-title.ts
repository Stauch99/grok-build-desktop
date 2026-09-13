/** Shared empty-title label used by disk scan fallbacks and the UI. */
export const UNTITLED_SESSION_LABEL = "未命名会话";

export function clipSessionTitle(text: string, n = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) : t;
}

/** UUID, blank, or the Grok summary.json fallback are not real titles. */
export function isUntitledSessionTitle(id: string, title: string): boolean {
  const t = title.trim();
  return !t || t === id || t === UNTITLED_SESSION_LABEL;
}

/** First typed user line. Slash commands are not titles. */
export function titleFromUserText(text: string, n = 40): string {
  const t = text.trim();
  if (!t || t.startsWith("/")) return "";
  return clipSessionTitle(t, n);
}
