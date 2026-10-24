import { describe, expect, it } from "vitest";
import { authorizedLauncherModules, resolveLauncherStart } from "./adaptiveModuleLauncher";

describe("TAD module launcher access", () => {
  it("keeps Vendi Studio hidden without BOTH tenant enablement and user permission", () => {
    const query = (enabledModules: Array<"vendi_studio">, permittedModules: Array<"vendi_studio">) =>
      authorizedLauncherModules({ audience: "business", enabledModules, permittedModules });
    expect(query([], ["vendi_studio"])).toEqual([]);
    expect(query(["vendi_studio"], [])).toEqual([]);
    expect(query(["vendi_studio"], ["vendi_studio"]).map(m => m.route)).toEqual(["/vendi-studio"]);
    expect(authorizedLauncherModules({
      audience: "consumer", enabledModules: ["vendi_studio"], permittedModules: ["vendi_studio"],
    })).toEqual([]);
  });
  it("only authorizes the intersection of tenant entitlement and user permission", () => {
    const modules = authorizedLauncherModules({
      audience: "business",
      enabledModules: ["crm", "marketing", "erp"],
      permittedModules: ["crm", "erp", "arqdor"],
    });
    expect(modules.map(m => m.key)).toEqual(["crm", "erp"]);
  });

  it("requires verified access for Prospector", () => {
    const granted = authorizedLauncherModules({
      audience: "business", enabledModules: ["prospector"], permittedModules: ["prospector"],
    });
    expect(granted.map(module => module.route)).toEqual(["/prospector"]);
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: ["prospector"], permittedModules: [],
    })).toEqual([]);
  });

  it("denies module links if either permission list is empty", () => {
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: [],
    })).toEqual([]);
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: [], permittedModules: ["crm"],
    })).toEqual([]);
  });

  it("never exposes consumer-only modules to business users", () => {
    const modules = authorizedLauncherModules({
      audience: "business",
      enabledModules: ["portal_cliente"],
      permittedModules: ["portal_cliente"],
    });
    expect(modules).toEqual([]);
  });

  it("selects the hub when a preferred route is missing or not authorized", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: ["crm"],
    });
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "arqdor" }))
      .toEqual({ type: "selector" });
    expect(resolveLauncherStart({ modules, preference: "select", principalModule: "crm" }))
      .toEqual({ type: "selector" });
  });

  it("opens only an authorized route on direct navigation", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: ["crm"],
    });
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "crm" }))
      .toEqual({ type: "navigate", route: "/leads" });
  });

  it("keeps a route-less product on the central selector", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["pdv"], permittedModules: ["pdv"],
    });
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "pdv" }))
      .toEqual({ type: "selector" });
  });
});
