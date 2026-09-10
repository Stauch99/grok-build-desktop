/** Matches `:root --bg` / dark `--bg` so the native window does not flash white. */
export function windowBackgroundCss(theme: "light" | "dark"): string {
  return theme === "dark" ? "hsl(30 5% 7%)" : "hsl(30 14.3% 97.3%)";
}

export function applyDocumentBackground(theme: "light" | "dark"): void {
  const el = document.documentElement;
  const fromToken = getComputedStyle(el).getPropertyValue("--bg").trim();
  el.style.backgroundColor = fromToken || windowBackgroundCss(theme);
}
