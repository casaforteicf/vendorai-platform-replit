import { useEffect, useState } from "react";

export const PUBLIC_COUNTRIES = {
  BR: { label: "Brasil", locale: "pt-BR", short: "BR", phone: "+55 49 99999-9999" },
  PY: { label: "Paraguay", locale: "es-PY", short: "PY", phone: "+595 981 234567" },
  AR: { label: "Argentina", locale: "es-AR", short: "AR", phone: "+54 9 11 1234-5678" },
  UY: { label: "Uruguay", locale: "es-UY", short: "UY", phone: "+598 99 123 456" },
  CL: { label: "Chile", locale: "es-CL", short: "CL", phone: "+56 9 1234 5678" },
} as const;

export type PublicCountryCode = keyof typeof PUBLIC_COUNTRIES;

const STORAGE_KEY = "vendorai_public_country";
const CHANGE_EVENT = "vendorai:public-country-change";

function isPublicCountryCode(value: string | null | undefined): value is PublicCountryCode {
  return Boolean(value && value in PUBLIC_COUNTRIES);
}

export function detectPublicCountry(): PublicCountryCode {
  if (typeof window === "undefined") return "BR";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isPublicCountryCode(stored)) return stored;

  const locale = window.navigator.language.toLowerCase();
  if (locale.includes("es-py")) return "PY";
  if (locale.includes("es-ar")) return "AR";
  if (locale.includes("es-uy")) return "UY";
  if (locale.includes("es-cl")) return "CL";
  return "BR";
}

export function persistPublicCountry(countryCode: PublicCountryCode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, countryCode);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: countryCode }));
  document.documentElement.lang = PUBLIC_COUNTRIES[countryCode].locale;
}

export function usePublicCountry() {
  const [countryCode, setCountryCodeState] = useState<PublicCountryCode>(detectPublicCountry);

  useEffect(() => {
    document.documentElement.lang = PUBLIC_COUNTRIES[countryCode].locale;

    const sync = () => setCountryCodeState(detectPublicCountry());
    const onCustomChange = (event: Event) => {
      const next = (event as CustomEvent<PublicCountryCode>).detail;
      if (isPublicCountryCode(next)) setCountryCodeState(next);
    };

    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, onCustomChange);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, onCustomChange);
    };
  }, [countryCode]);

  function setCountryCode(next: PublicCountryCode) {
    persistPublicCountry(next);
    setCountryCodeState(next);
  }

  return {
    countryCode,
    setCountryCode,
    country: PUBLIC_COUNTRIES[countryCode],
    isSpanish: countryCode !== "BR",
  };
}
