export const TENANT_COUNTRY_PROFILES = {
  BR: {
    label: "Brasil",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    taxType: "CNPJ",
    taxPlaceholder: "00.000.000/0001-00",
  },
  PY: {
    label: "Paraguai",
    locale: "es-PY",
    timezone: "America/Asuncion",
    currency: "PYG",
    taxType: "RUC",
    taxPlaceholder: "80012345-6",
  },
  AR: {
    label: "Argentina",
    locale: "es-AR",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
    taxType: "CUIT",
    taxPlaceholder: "30-12345678-9",
  },
  UY: {
    label: "Uruguai",
    locale: "es-UY",
    timezone: "America/Montevideo",
    currency: "UYU",
    taxType: "RUT",
    taxPlaceholder: "210123450019",
  },
  CL: {
    label: "Chile",
    locale: "es-CL",
    timezone: "America/Santiago",
    currency: "CLP",
    taxType: "RUT",
    taxPlaceholder: "76.123.456-7",
  },
} as const;

export type TenantCountryCode = keyof typeof TENANT_COUNTRY_PROFILES;
export type TenantSupportedLocale = "pt-BR" | "es-PY" | "es-AR" | "es-UY" | "es-CL";
export type TenantSupportedCurrency = "BRL" | "USD" | "PYG" | "ARS" | "UYU" | "CLP";

export const TENANT_LOCALES: Array<{ value: TenantSupportedLocale; label: string }> = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es-PY", label: "Español (Paraguay)" },
  { value: "es-AR", label: "Español (Argentina)" },
  { value: "es-UY", label: "Español (Uruguay)" },
  { value: "es-CL", label: "Español (Chile)" },
];

export const TENANT_CURRENCIES: TenantSupportedCurrency[] = ["BRL", "USD", "PYG", "ARS", "UYU", "CLP"];

export const TENANT_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Asuncion",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
] as const;

export function getTenantCountryProfile(countryCode?: string | null) {
  const normalized = countryCode?.toUpperCase();
  if (normalized && normalized in TENANT_COUNTRY_PROFILES) {
    return TENANT_COUNTRY_PROFILES[normalized as TenantCountryCode];
  }
  return TENANT_COUNTRY_PROFILES.BR;
}

export function buildTenantInternationalDefaults(countryCode: TenantCountryCode) {
  const profile = TENANT_COUNTRY_PROFILES[countryCode];
  return {
    countryCode,
    defaultLocale: profile.locale,
    timezone: profile.timezone,
    defaultCurrency: profile.currency,
    supportedCurrencies: [profile.currency],
    taxIdentifierType: profile.taxType,
  };
}
