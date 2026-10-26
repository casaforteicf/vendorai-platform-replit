import { describe, expect, it } from "vitest";
import { authorizedLauncherModules, resolveLauncherStart, resolveTadLauncherModules, LAUNCHER_MODULES } from "./adaptiveModuleLauncher";

describe("TAD module launcher access", () => {
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

  it("shows every ecosystem environment for a platform Superadmin, independently of tenant entitlements", () => {
    const modules = resolveTadLauncherModules({
      audience: "business",
      enabledModules: [],
      permittedModules: [],
      isPlatformSuperAdmin: true,
    });
    expect(modules.listed.map(module => module.key)).toEqual(LAUNCHER_MODULES.map(module => module.key));
    expect(modules.authorized.map(module => module.key)).toContain("arqdor");
    expect(modules.authorized.map(module => module.key)).toContain("erp");
    expect(modules.authorized.every(module => module.route !== null)).toBe(true);
    expect(modules.authorized.some(module => module.key === "pdv")).toBe(false);
    expect(modules.listed.map(module => module.key)).toContain("portal_cliente");
  });

  it("keeps ordinary admins and users limited to confirmed tenant access", () => {
    const modules = resolveTadLauncherModules({
      audience: "business",
      enabledModules: ["crm", "arqdor"],
      permittedModules: ["crm"],
      previewModules: ["arqdor"],
      isPlatformSuperAdmin: false,
    });
    expect(modules.authorized.map(module => module.key)).toEqual(["crm"]);
    expect(modules.listed.map(module => module.key)).toEqual(["crm", "arqdor"]);
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
