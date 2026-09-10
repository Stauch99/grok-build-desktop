export type ThemePref = "light" | "dark" | "system";
export type AppliedTheme = "light" | "dark";

export function parseThemePref(raw: unknown): ThemePref | null {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return null;
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): AppliedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export function systemPrefersDark(media?: { matches: boolean } | null): boolean {
  return !!media?.matches;
}

/** Command-palette toggle always pins light/dark; it leaves auto-follow. */
export function togglePinnedTheme(pref: ThemePref, applied: AppliedTheme): AppliedTheme {
  return (pref === "system" ? applied : pref) === "light" ? "dark" : "light";
}
