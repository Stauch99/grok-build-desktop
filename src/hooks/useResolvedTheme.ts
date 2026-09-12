import { useEffect, useState } from "react";
import { resolveTheme, type AppliedTheme, type ThemePref } from "../lib/theme-pref";

export function useResolvedTheme(pref: ThemePref): AppliedTheme {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemDark(mq.matches);
    apply();
    if (pref !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  return resolveTheme(pref, systemDark);
}
