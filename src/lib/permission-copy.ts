import { t, type Locale } from "./i18n";

export type PermissionModeId = "ask" | "always-approve" | "auto";

export function permissionModeHint(mode: string, locale: Locale = "zh"): string {
  if (mode === "always-approve") return t(locale, "perm.yoloHint");
  if (mode === "auto") return t(locale, "perm.autoHint");
  return t(locale, "perm.askHint");
}

export function permissionTimeoutNotice(locale: Locale = "zh"): string {
  return t(locale, "perm.wait");
}
