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


describe("UX-UNIFY-01: regressão de visibilidade e navegação", () => {
  it("não oferece módulo não contratado mesmo se usuário tiver permissão", () => {
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: ["crm", "marketing", "erp"],
    }).map(m => m.key)).toEqual(["crm"]);
  });

  it("não oferece módulo contratado sem permissão efetiva do usuário", () => {
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: ["crm", "erp"], permittedModules: ["crm"],
    }).map(m => m.key)).toEqual(["crm"]);
  });

  it("não expõe Portal do Cliente externo ao público empresarial", () => {
    expect(authorizedLauncherModules({
      audience: "business", enabledModules: ["portal_cliente"], permittedModules: ["portal_cliente"],
    })).toEqual([]);
    expect(authorizedLauncherModules({
      audience: "consumer", enabledModules: ["portal_cliente"], permittedModules: ["portal_cliente"],
    }).map(m => m.key)).toEqual(["portal_cliente"]);
  });

  it("não redireciona automaticamente para rota nula", () => {
    for (const key of ["pdv", "parceiros"] as const) {
      const modules = authorizedLauncherModules({
        audience: "business", enabledModules: [key], permittedModules: [key],
      });
      expect(resolveLauncherStart({ modules, preference: "direct", principalModule: key }))
        .toEqual({ type: "selector" });
    }
  });

  it("último módulo não autorizado não pode ser reaberto automaticamente", () => {
    const modules = authorizedLauncherModules({
      audience: "business", enabledModules: ["crm"], permittedModules: ["crm"],
    });
    expect(resolveLauncherStart({ modules, preference: "last", lastModule: "erp" }))
      .toEqual({ type: "selector" });
    expect(resolveLauncherStart({ modules, preference: "last", lastModule: "crm" }))
      .toEqual({ type: "navigate", route: "/leads" });
  });
});
