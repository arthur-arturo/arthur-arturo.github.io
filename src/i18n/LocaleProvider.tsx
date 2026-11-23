import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "es";
  return window.localStorage.getItem("portfolio-locale") === "en" ? "en" : "es";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "es" ? "Arthur Alvarez | Desarrollador" : "Arthur Alvarez | Developer";
    window.localStorage.setItem("portfolio-locale", locale);
  }, [locale]);

  const t = (key: TranslationKey) => translations[locale][key];

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
