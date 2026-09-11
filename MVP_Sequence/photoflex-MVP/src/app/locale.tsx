import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type TranslationVariables } from "./localeDictionary";

export type { Locale } from "./localeDictionary";

export const LOCALE_STORAGE_KEY = "photoflex:locale";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: "en",
  setLocale: () => undefined,
});

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en") return saved;
    return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  } catch { return "en"; }
}

export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Locale preference is disposable. */ }
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}><div className={`locale-root locale-${locale}`} lang={locale}>{children}</div></LocaleContext.Provider>;
}

export function useLocale() {
  const { locale, setLocale } = useContext(LocaleContext);
  const t = useCallback((key: string, variablesOrFallback?: TranslationVariables | string, fallback?: string) => {
    const variables = typeof variablesOrFallback === "string" ? undefined : variablesOrFallback;
    return translate(locale, key, variables, typeof variablesOrFallback === "string" ? variablesOrFallback : fallback);
  }, [locale]);
  return { locale, setLocale, t };
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <div className="language-switcher" role="group" aria-label={t("language.label")}>
    <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    <button type="button" className={locale === "zh-CN" ? "is-active" : ""} aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>{t("language.chinese")}</button>
  </div>;
}
