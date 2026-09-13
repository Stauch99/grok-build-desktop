import { t, type Locale } from "./i18n";

let current: Locale = "zh";

/**
 * lib-layer pure functions have no React context; components keep this
 * mirror in sync (one effect on locale change) so helpers like statusLabel
 * can localize without threading `t` through every signature.
 */
const listeners = new Set<() => void>();

export function setBridgeLocale(locale: Locale): void {
  current = locale;
  for (const fn of listeners) fn();
}

export function bridgeLocale(): Locale {
  return current;
}

/**
 * Module-level exported consts cannot call tr() lazily; register a refresh
 * callback so they re-resolve the key whenever the UI locale flips.
 */
export function onBridgeLocaleChange(fn: () => void): void {
  listeners.add(fn);
}

export function tr(key: string, vars?: Record<string, string | number>): string {
  return t(current, key, vars);
}
