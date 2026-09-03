import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { messages, type TranslationKey } from "./messages";

export const supportedLocales = ["pt-BR", "es-PY", "es-AR", "es-UY", "es-CL"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const STORAGE_KEY = "vendorai_locale";
const DEFAULT_LOCALE: SupportedLocale = "pt-BR";

function normalizeLocale(locale?: string | null): SupportedLocale | null {
  if (!locale) return null;
  const value = locale.trim();

  if (supportedLocales.includes(value as SupportedLocale)) {
    return value as SupportedLocale;
  }

  const lower = value.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("es-py")) return "es-PY";
  if (lower.startsWith("es-ar")) return "es-AR";
  if (lower.startsWith("es-uy")) return "es-UY";
  if (lower.startsWith("es-cl")) return "es-CL";
  if (lower.startsWith("es")) return "es-PY";

  return null;
}

function detectBrowserLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;

  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const browserLocale of browserLocales) {
    const normalized = normalizeLocale(browserLocale);
    if (normalized) return normalized;
  }

  return DEFAULT_LOCALE;
}

function dictionaryFor(locale: SupportedLocale) {
  return locale === "pt-BR" ? messages["pt-BR"] : messages.es;
}

export function resolveLocale(input: {
  userLocale?: string | null;
  tenantLocale?: string | null;
  browserLocales?: readonly string[] | null;
  countryCode?: string | null;
}): SupportedLocale {
  const explicit = normalizeLocale(input.userLocale) ?? normalizeLocale(input.tenantLocale);
  if (explicit) return explicit;

  for (const candidate of input.browserLocales ?? []) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }

  switch (input.countryCode?.toUpperCase()) {
    case "PY":
      return "es-PY";
    case "AR":
      return "es-AR";
    case "UY":
      return "es-UY";
    case "CL":
      return "es-CL";
    default:
      return DEFAULT_LOCALE;
  }
}

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency: string) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectBrowserLocale);

  const setLocale = (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextLocale);
      document.documentElement.lang = nextLocale;
    }
  };

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaryFor(locale);

    return {
      locale,
      setLocale,
      t: (key, variables) => {
        let text = dictionary[key] ?? messages["pt-BR"][key] ?? key;
        if (!variables) return text;
        for (const [name, variable] of Object.entries(variables)) {
          text = text.replaceAll(`{{${name}}}`, String(variable));
        }
        return text;
      },
      formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
      formatCurrency: (number, currency) =>
        new Intl.NumberFormat(locale, { style: "currency", currency }).format(number),
      formatDate: (date, options) =>
        new Intl.DateTimeFormat(locale, options).format(date instanceof Date ? date : new Date(date)),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
