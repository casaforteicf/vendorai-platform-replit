import { describe, expect, it } from "vitest";
import { mergeAppTenantBranding } from "./app_tenant_branding.js";

describe("app tenant branding", () => {
  it("uses the current tenant brand when inheritance is enabled", () => {
    const result = mergeAppTenantBranding(
      "Portal",
      { inheritFromTenant: true, primaryColor: "#old", radius: "12px", source: "tenant" },
      { inheritFromTenant: true, logoUrl: "https://old/logo.png", appName: "Antigo" },
      { tenantName: "Empresa Atual", primaryColor: "#123456", logoUrl: "https://new/logo.png", faviconUrl: "https://new/favicon.png" },
    );
    expect(result.theme).toMatchObject({ primaryColor: "#123456", radius: "12px", inheritFromTenant: true, source: "tenant" });
    expect(result.whiteLabel).toMatchObject({ appName: "Portal", companyName: "Empresa Atual", logoUrl: "https://new/logo.png", faviconUrl: "https://new/favicon.png" });
  });

  it("preserves explicit app overrides when inheritance is disabled", () => {
    const result = mergeAppTenantBranding(
      "Portal",
      { inheritFromTenant: false, primaryColor: "#abcdef" },
      { inheritFromTenant: false, appName: "Marca própria", logoUrl: "https://app/logo.png" },
      { tenantName: "Tenant", primaryColor: "#000000", logoUrl: "https://tenant/logo.png" },
    );
    expect(result.theme).toMatchObject({ primaryColor: "#abcdef", source: "app" });
    expect(result.whiteLabel).toMatchObject({ appName: "Marca própria", logoUrl: "https://app/logo.png", source: "app" });
  });
});