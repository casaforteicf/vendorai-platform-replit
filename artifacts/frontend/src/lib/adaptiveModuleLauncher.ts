/**
 * UI-01.10 — Module landing policy (presentation only).
 * The caller MUST supply server-verified entitlements and record permissions.
 * No role implicitly unlocks an entitlement; no grant is stored client-side.
 */
export type LauncherModule = "crm" | "prospector" | "marketing" | "omnichannel" | "agenda" |
  "arqdor" | "obras" | "pdv" | "erp" | "marketplace_casa" |
  "parceiros" | "portal_cliente" | "inteligencia" | "agentes_ia" | "configuracoes" | "suporte";

export type LauncherAudience = "consumer" | "professional" | "business";
export interface LauncherModuleInfo {
  key: LauncherModule;
  title: string;
  route: string | null;
  audiences: readonly LauncherAudience[];
}

export const LAUNCHER_MODULES: readonly LauncherModuleInfo[] = [
  { key: "crm", title: "CRM", route: "/leads", audiences: ["professional", "business"] },
  { key: "prospector", title: "Prospector IA", route: "/prospector", audiences: ["professional", "business"] },
  { key: "marketing", title: "Marketing", route: "/content", audiences: ["business"] },
  { key: "omnichannel", title: "Omnichannel", route: "/conversations", audiences: ["professional", "business"] },
  { key: "agenda", title: "Agenda", route: "/agenda", audiences: ["professional", "business"] },
  { key: "arqdor", title: "Arqdor", route: "/arch", audiences: ["professional", "business"] },
  { key: "obras", title: "Obras e Serviços", route: "/obras", audiences: ["professional", "business"] },
  { key: "pdv", title: "PDV", route: null, audiences: ["business"] },
  { key: "erp", title: "ERP", route: "/erp", audiences: ["business"] },
  { key: "marketplace_casa", title: "Praça.ai · Operações", route: "/praca-executivo", audiences: ["consumer", "professional", "business"] },
  { key: "parceiros", title: "Parceiros", route: null, audiences: ["professional", "business"] },
  { key: "portal_cliente", title: "Portal do Cliente", route: null, audiences: ["consumer"] },
  { key: "inteligencia", title: "Inteligência", route: "/analytics", audiences: ["professional", "business"] },
  { key: "agentes_ia", title: "Vendi IA", route: "/vendi/operacoes", audiences: ["professional", "business"] },
  { key: "configuracoes", title: "Configurações", route: "/configuracoes", audiences: ["business"] },
  { key: "suporte", title: "Suporte", route: "/faq", audiences: ["professional", "business"] },
] as const;

export function authorizedLauncherModules(input: {
  audience: LauncherAudience;
  enabledModules: readonly LauncherModule[];
  permittedModules: readonly LauncherModule[];
}): LauncherModuleInfo[] {
  const enabled = new Set(input.enabledModules);
  const permitted = new Set(input.permittedModules);
  return LAUNCHER_MODULES.filter(module =>
    module.audiences.includes(input.audience) &&
    enabled.has(module.key) && permitted.has(module.key));
}

/**
 * Determines an initial navigation without guessing a route.
 * Missing entitlement or missing route = show selector, not forced navigation.
 */
export function resolveLauncherStart(input: {
  modules: readonly LauncherModuleInfo[];
  preference: "select" | "direct" | "last";
  principalModule?: LauncherModule;
  lastModule?: LauncherModule;
}): { type: "selector" } | { type: "navigate"; route: string } {
  if (input.preference === "select") return { type: "selector" };
  const selected = input.modules.find(module =>
    module.key === (input.preference === "last" ? input.lastModule : input.principalModule));
  return selected?.route ? { type: "navigate", route: selected.route } : { type: "selector" };
}
