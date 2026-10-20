import { describe, expect, it } from "vitest";
import { authorizedLauncherModules, resolveLauncherStart } from "./adaptiveModuleLauncher";

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


describe("Operações: alteração segura apenas de apresentação", () => {
  it("mantém rota, permissões e identidade técnica do módulo existente", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["obras"], permittedModules: ["obras"],
    });
    expect(modules).toEqual([{key: "obras", title: "Operações", route: "/obras", audiences: ["professional", "business"]}]);
    expect(resolveLauncherStart({modules, preference: "direct", principalModule: "obras"}))
      .toEqual({type: "navigate", route: "/obras"});
  });
});

describe("Central de Ambientes: regressões de acesso e preferência", () => {
  it("ignora módulo salvo se o acesso foi revogado", () => {
    const modules = authorizedLauncherModules({
      audience: "business",
      enabledModules: ["crm", "marketing"],
      permittedModules: ["crm"],
    });
    expect(resolveLauncherStart({ modules, preference: "last", lastModule: "marketing" }))
      .toEqual({ type: "selector" });
  });

  it("não mistura o portal de consumidor com os ambientes empresariais", () => {
    const modules = authorizedLauncherModules({
      audience: "consumer",
      enabledModules: ["crm", "marketplace_casa", "portal_cliente"],
      permittedModules: ["crm", "marketplace_casa", "portal_cliente"],
    });
    expect(modules.map(module => module.key)).toEqual(["marketplace_casa", "portal_cliente"]);
    expect(resolveLauncherStart({ modules, preference: "direct", principalModule: "portal_cliente" }))
      .toEqual({ type: "selector" });
  });

  it("mantém o ambiente Arqdor separado e acessível apenas se autorizado", () => {
    const modules = authorizedLauncherModules({
      audience: "professional",
      enabledModules: ["arqdor", "obras"],
      permittedModules: ["arqdor"],
    });
    expect(modules.map(module => ({key: module.key, route: module.route})))
      .toEqual([{key: "arqdor", route: "/arch"}]);
  });

  it("não navega automaticamente quando nenhum ambiente está autorizado", () => {
    expect(resolveLauncherStart({ modules: [], preference: "last", lastModule: "crm" }))
      .toEqual({ type: "selector" });
  });
});
