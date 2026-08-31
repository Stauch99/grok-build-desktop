import { createContext, useContext, type ReactNode } from "react";
import { t, type Locale } from "./i18n";

const LocaleContext = createContext<Locale>("zh");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
}
