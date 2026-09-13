/**
 * "What's new" once-per-version gate. The seen marker lives in localStorage
 * (per-machine chrome, same as sidebar prefs) — recording happens when the
 * overlay is shown, so dismissal needs no extra flag.
 */
import { storageGet, storageSet } from "./sidebar-local";

export const WHATS_NEW_KEY = "grok.whatsNew.seen";

/** Matches package.json; used when the Tauri runtime is unavailable (tests, web dev). */
export const APP_VERSION_FALLBACK = "0.6.5";

export function whatsNewSeenVersion(
  get: (key: string) => string | null = storageGet,
): string | null {
  const raw = get(WHATS_NEW_KEY);
  return raw && raw.trim() ? raw : null;
}

export function markWhatsNewSeen(
  version: string,
  set: (key: string, value: string) => void = storageSet,
): void {
  if (version) set(WHATS_NEW_KEY, version);
}

/**
 * Show when the running version differs from the last seen one — including
 * the first launch ever (`seen === null`), where the card doubles as a
 * welcome note for this wave's features.
 */
export function shouldShowWhatsNew(current: string, seen: string | null): boolean {
  return current.trim().length > 0 && seen !== current;
}

/** App version from the Tauri runtime, with a static fallback off-Tauri. */
export async function currentAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    const v = await getVersion();
    if (v) return v;
  } catch {
    /* invoke is unavailable outside the Tauri webview */
  }
  return APP_VERSION_FALLBACK;
}
