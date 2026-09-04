export const TENANT_COUNTRY_PROFILES = {
  BR: { defaultLocale: "pt-BR", timezone: "America/Sao_Paulo", defaultCurrency: "BRL", taxIdentifierType: "CNPJ" },
  PY: { defaultLocale: "es-PY", timezone: "America/Asuncion", defaultCurrency: "PYG", taxIdentifierType: "RUC" },
  AR: { defaultLocale: "es-AR", timezone: "America/Argentina/Buenos_Aires", defaultCurrency: "ARS", taxIdentifierType: "CUIT" },
  UY: { defaultLocale: "es-UY", timezone: "America/Montevideo", defaultCurrency: "UYU", taxIdentifierType: "RUT" },
  CL: { defaultLocale: "es-CL", timezone: "America/Santiago", defaultCurrency: "CLP", taxIdentifierType: "RUT" },
} as const;

export type TenantCountryCode = keyof typeof TENANT_COUNTRY_PROFILES;

export function normalizeTenantCountryCode(value?: string | null): TenantCountryCode | null {
  if (!value?.trim()) return "BR";

  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const aliases: Record<string, TenantCountryCode> = {
    br: "BR",
    brasil: "BR",
    brazil: "BR",
    py: "PY",
    paraguai: "PY",
    paraguay: "PY",
    ar: "AR",
    argentina: "AR",
    uy: "UY",
    uruguai: "UY",
    uruguay: "UY",
    cl: "CL",
    chile: "CL",
  };

  return aliases[normalized] ?? null;
}

export function tenantCountryInsertFields(countryCode: TenantCountryCode) {
  const profile = TENANT_COUNTRY_PROFILES[countryCode];
  return {
    countryCode,
    defaultLocale: profile.defaultLocale,
    timezone: profile.timezone,
    defaultCurrency: profile.defaultCurrency,
    supportedCurrencies: [profile.defaultCurrency],
    taxIdentifierType: profile.taxIdentifierType,
  } as const;
}
