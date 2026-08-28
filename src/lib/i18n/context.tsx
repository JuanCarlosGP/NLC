import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/locale";
import { setRuntimeLocale } from "@/lib/i18n/runtime";
import { loadLocale, saveLocale } from "@/lib/i18n/storage";
import { translate, type I18nVars } from "@/lib/i18n/t";

type I18nValue = {
  ready: boolean;
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: (path: string, vars?: I18nVars) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadLocale();
        if (cancelled) return;
        setRuntimeLocale(stored);
        setLocaleState(stored);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    setRuntimeLocale(next);
    void saveLocale(next);
  }, []);

  const t = useCallback(
    (path: string, vars?: I18nVars) => translate(locale, path, vars),
    [locale],
  );

  const value = useMemo(() => ({ ready, locale, setLocale, t }), [ready, locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}
