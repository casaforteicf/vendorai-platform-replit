import { describe, expect, it } from "vitest";
import { authorizedLauncherModules, resolveLauncherStart } from "./adaptiveModuleLauncher";
import { CASA_CATEGORIES, marketplaceCasaFlow, publicCasaListing } from "./marketplaceCasaCatalog";

describe("adaptive post-login module launcher", () => {
  it("shows only audience-compatible AND server-authorized modules", () => {
    const modules = authorizedLauncherModules({
      audience: "consumer",
      enabledModules: ["portal_cliente", "marketplace_casa", "crm"],
      permittedModules: ["portal_cliente", "crm"],
    });
    expect(modules.map(x => x.key)).toEqual(["portal_cliente"]);
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "portal_cliente" }))
      .toEqual({ type: "selector" }); // do not navigate to a guessed portal route
  });
  it("rejects stale last-module preferences", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: ["crm"],
    });
    expect(resolveLauncherStart({ modules, preference: "last", lastModule: "erp" }))
      .toEqual({ type: "selector" });
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "crm" }))
      .toEqual({ type: "navigate", route: "/leads" });
  });
  it("does not infer paid modules from user role", () => {
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: [], permittedModules: ["erp", "pdv", "crm"],
    })).toEqual([]);
  });
});

describe("Marketplace Casa single catalog vertical", () => {
  it("includes housing, construction, furnishing and appliances", () => {
    expect(CASA_CATEGORIES.map(x => x.key)).toEqual(expect.arrayContaining([
      "imoveis", "terrenos", "construcao", "moveis", "decoracao", "eletrodomesticos",
    ]));
  });
  it("uses distinct workflows for real estate, service quotation, and catalog items", () => {
    expect(marketplaceCasaFlow("imoveis")).toBe("visit_and_proposal");
    expect(marketplaceCasaFlow("construcao")).toBe("quotation");
    expect(marketplaceCasaFlow("eletrodomesticos")).toBe("catalog_checkout");
  });
  it("does not expose private business or project IDs through the public listing", () => {
    expect(publicCasaListing({
      listingId: "item-1", sourceMarketplaceId: "internal-1",
      category: "imoveis", tenantId: "tenant-1",
      projectId: "secret-project", businessId: "secret-deal",
    })).toEqual({ listingId: "item-1", category: "imoveis" });
  });
});
