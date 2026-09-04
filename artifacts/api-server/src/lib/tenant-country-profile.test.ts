import { describe, expect, it } from "vitest";
import { getTenantCountryProfile, TENANT_COUNTRY_PROFILES } from "./tenant-country-profile.js";

describe("tenant country profiles", () => {
  it("keeps the five official LATAM profiles", () => {
    expect(TENANT_COUNTRY_PROFILES).toEqual({
      BR: { defaultLocale: "pt-BR", timezone: "America/Sao_Paulo", defaultCurrency: "BRL", taxIdentifierType: "CNPJ" },
      PY: { defaultLocale: "es-PY", timezone: "America/Asuncion", defaultCurrency: "PYG", taxIdentifierType: "RUC" },
      AR: { defaultLocale: "es-AR", timezone: "America/Argentina/Buenos_Aires", defaultCurrency: "ARS", taxIdentifierType: "CUIT" },
      UY: { defaultLocale: "es-UY", timezone: "America/Montevideo", defaultCurrency: "UYU", taxIdentifierType: "RUT" },
      CL: { defaultLocale: "es-CL", timezone: "America/Santiago", defaultCurrency: "CLP", taxIdentifierType: "RUT" },
    });
  });

  it("returns locale and currency for Spanish trial countries", () => {
    expect(getTenantCountryProfile("PY")).toMatchObject({ defaultLocale: "es-PY", defaultCurrency: "PYG" });
    expect(getTenantCountryProfile("AR")).toMatchObject({ defaultLocale: "es-AR", defaultCurrency: "ARS" });
    expect(getTenantCountryProfile("UY")).toMatchObject({ defaultLocale: "es-UY", defaultCurrency: "UYU" });
    expect(getTenantCountryProfile("CL")).toMatchObject({ defaultLocale: "es-CL", defaultCurrency: "CLP" });
  });
});
