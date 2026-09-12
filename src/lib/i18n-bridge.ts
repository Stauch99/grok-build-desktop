import { t, type Locale } from "./i18n";

let current: Locale = "zh";

/**
 * lib-layer pure functions have no React context; components keep this
 * mirror in sync (one effect on locale change) so helpers like statusLabel
 * can localize without threading `t` through every signature.
 */
export function setBridgeLocale(locale: Locale): void {
  current = locale;
}

export function bridgeLocale(): Locale {
  return current;
}

export function tr(key: string, vars?: Record<string, string | number>): string {
  return t(current, key, vars);
}
