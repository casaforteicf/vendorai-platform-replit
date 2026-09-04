import { describe, expect, it } from "vitest";
import {
  getTenantCountryProfile,
  normalizeTenantCountryCode,
  TENANT_COUNTRY_PROFILES,
} from "./tenant-country-profile.js";

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

  it("normalizes supported country aliases and defaults legacy calls to BR", () => {
    expect(normalizeTenantCountryCode()).toBe("BR");
    expect(normalizeTenantCountryCode("Paraguay")).toBe("PY");
    expect(normalizeTenantCountryCode("Argentina")).toBe("AR");
    expect(normalizeTenantCountryCode("Uruguai")).toBe("UY");
    expect(normalizeTenantCountryCode("Chile")).toBe("CL");
    expect(normalizeTenantCountryCode("XX")).toBeNull();
  });

  it("returns the selected locale and currency for a trial tenant", () => {
    expect(getTenantCountryProfile("PY")).toMatchObject({ defaultLocale: "es-PY", defaultCurrency: "PYG" });
    expect(getTenantCountryProfile("CL")).toMatchObject({ defaultLocale: "es-CL", defaultCurrency: "CLP" });
  });
});
