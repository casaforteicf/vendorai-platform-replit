export const TENANT_COUNTRY_PROFILES = {
  BR: { defaultLocale: "pt-BR", timezone: "America/Sao_Paulo", defaultCurrency: "BRL", taxIdentifierType: "CNPJ" },
  PY: { defaultLocale: "es-PY", timezone: "America/Asuncion", defaultCurrency: "PYG", taxIdentifierType: "RUC" },
  AR: { defaultLocale: "es-AR", timezone: "America/Argentina/Buenos_Aires", defaultCurrency: "ARS", taxIdentifierType: "CUIT" },
  UY: { defaultLocale: "es-UY", timezone: "America/Montevideo", defaultCurrency: "UYU", taxIdentifierType: "RUT" },
  CL: { defaultLocale: "es-CL", timezone: "America/Santiago", defaultCurrency: "CLP", taxIdentifierType: "RUT" },
} as const;

export type TenantCountryCode = keyof typeof TENANT_COUNTRY_PROFILES;

export function getTenantCountryProfile(countryCode: TenantCountryCode) {
  return TENANT_COUNTRY_PROFILES[countryCode];
}
