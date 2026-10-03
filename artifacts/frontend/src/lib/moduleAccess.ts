import type { User, UserFunction } from "@workspace/api-client-react";

const ALL_USER_MODULES = [
  { key: "dashboard", label: "Dashboard", labelEs: "Dashboard" },
  { key: "leads", label: "Leads", labelEs: "Leads" },
  { key: "prospector", label: "Prospector", labelEs: "Prospector" },
  { key: "deals", label: "Negócios", labelEs: "Negocios" },
  { key: "conversations", label: "Conversas", labelEs: "Conversaciones" },
  { key: "agenda", label: "Agenda", labelEs: "Agenda" },
  { key: "deliveries", label: "Entregas", labelEs: "Entregas" },
  { key: "proposals", label: "Orçamentos e propostas", labelEs: "Presupuestos y propuestas" },
  { key: "catalog", label: "Catálogo e estoque", labelEs: "Catálogo e inventario" },
  { key: "erp", label: "Gestão ERP e financeiro", labelEs: "Gestión ERP y finanzas" },
  { key: "agents", label: "Agentes de IA", labelEs: "Agentes de IA" },
  { key: "knowledge", label: "Base de conhecimento", labelEs: "Base de conocimiento" },
  { key: "analytics", label: "Métricas e relatórios", labelEs: "Métricas e informes" },
  { key: "team", label: "Equipe e usuários", labelEs: "Equipo y usuarios" },
  { key: "settings", label: "Configurações", labelEs: "Configuración" },
  { key: "content", label: "Conteúdo e campanhas", labelEs: "Contenido y campañas" },
  { key: "revenue_scout", label: "Revenue Scout", labelEs: "Revenue Scout" },
  { key: "pharmacy", label: "Central da Farmácia", labelEs: "Central de Farmacia" },
] as const;

export type UserModuleKey = (typeof ALL_USER_MODULES)[number]["key"];
type UserModuleDefinition = (typeof ALL_USER_MODULES)[number];

const PHARMACY_MODULE: UserModuleKey = "pharmacy";
const GENERAL_MODULES = ALL_USER_MODULES
  .filter((item) => item.key !== PHARMACY_MODULE)
  .map((item) => item.key) as UserModuleKey[];

function normalizeVertical(vertical?: string | null): string {
  return (vertical ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isPharmacyVertical(vertical?: string | null): boolean {
  return normalizeVertical(vertical) === "farmacia";
}

function readBrowserVertical(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const overrideRaw = window.localStorage.getItem("vendorai_sa_tenant_override");
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as { vertical?: unknown };
      if (typeof override?.vertical === "string") return override.vertical;
    }

    const cachedUserRaw = window.localStorage.getItem("vendorai_user_cache");
    if (!cachedUserRaw) return null;
    const cachedUser = JSON.parse(cachedUserRaw) as { tenantVertical?: unknown };
    return typeof cachedUser?.tenantVertical === "string" ? cachedUser.tenantVertical : null;
  } catch {
    return null;
  }
}

function currentUserModules(): readonly UserModuleDefinition[] {
  const vertical = readBrowserVertical();
  return ALL_USER_MODULES.filter(
    (module) => module.key !== PHARMACY_MODULE || isPharmacyVertical(vertical),
  );
}

/**
 * Lista usada pelas telas de gestão de usuários/funções.
 *
 * A API pública continua sendo um array para não quebrar os consumidores
 * existentes, mas a lista é resolvida no momento do uso. Assim a Central da
 * Farmácia só aparece quando o tenant/preview atual pertence à vertical
 * Farmácia, inclusive após login ou troca de tenant sem recarregar o bundle.
 */
export const USER_MODULES = new Proxy(ALL_USER_MODULES, {
  get(_target, property) {
    const modules = currentUserModules();
    const value = Reflect.get(modules, property, modules);
    return typeof value === "function" ? value.bind(modules) : value;
  },
}) as unknown as readonly UserModuleDefinition[];

export const DEFAULT_MODULES_BY_FUNCTION: Record<UserFunction, UserModuleKey[]> = {
  administrador: [...GENERAL_MODULES],
  vendedor: ["dashboard", "leads", "prospector", "deals", "conversations", "agenda", "proposals", "catalog"],
  representante_comercial: ["dashboard", "leads", "prospector", "deals", "conversations", "agenda", "proposals", "catalog"],
  financeiro: ["dashboard", "deals", "proposals", "catalog", "erp", "analytics"],
  suporte: ["dashboard", "leads", "prospector", "conversations", "agenda", "knowledge"],
  entrega: ["dashboard", "deals", "deliveries", "proposals"],
  outro: ["dashboard", "leads", "prospector", "deals", "conversations", "agenda", "proposals", "catalog", "erp", "analytics", "revenue_scout"],
};

const PHARMACY_DEFAULT_FUNCTIONS = new Set<UserFunction>(["administrador", "vendedor", "representante_comercial", "outro"]);

export function modulesForFunction(fn?: UserFunction | null, tenantVertical?: string | null): UserModuleKey[] {
  const userFunction = fn ?? "outro";
  const modules = [...DEFAULT_MODULES_BY_FUNCTION[userFunction]];
  const vertical = tenantVertical ?? readBrowserVertical();

  if (
    isPharmacyVertical(vertical) &&
    PHARMACY_DEFAULT_FUNCTIONS.has(userFunction) &&
    !modules.includes(PHARMACY_MODULE)
  ) {
    modules.push(PHARMACY_MODULE);
  }

  return modules;
}

export function moduleForPath(path: string): UserModuleKey | null {
  if (path === "/" || path === "/dashboard") return "dashboard";
  if (path.startsWith("/leads")) return "leads";
  if (path.startsWith("/app/prospector") || path.startsWith("/prospector")) return "prospector";
  if (path.startsWith("/deals") || path.startsWith("/comissoes")) return "deals";
  if (path.startsWith("/conversations")) return "conversations";
  if (path.startsWith("/agenda")) return "agenda";
  if (path.startsWith("/entregas") || path.startsWith("/fretes")) return "deliveries";
  if (path.startsWith("/propostas") || path.startsWith("/solicitacoes-compra")) return "proposals";
  if (path.startsWith("/catalogo") || path.startsWith("/estoque") || path.startsWith("/varejo")) return "catalog";
  if (path.startsWith("/erp") || path.startsWith("/financeiro")) return "erp";
  if (path.startsWith("/agents") || path.startsWith("/vendi")) return "agents";
  if (path.startsWith("/base-conhecimento")) return "knowledge";
  if (path.startsWith("/diagnostico-planejamento")) return "analytics";
  if (path.startsWith("/analytics") || path.startsWith("/relatorios")) return "analytics";
  if (path.startsWith("/usuarios") || path.startsWith("/organizacao")) return "team";
  if (path.startsWith("/configuracoes") || path.startsWith("/guia-implantacao")) return "settings";
  if (path.startsWith("/content") || path.startsWith("/campanhas") || path.startsWith("/video")) return "content";
  if (path.startsWith("/scout")) return "revenue_scout";
  if (path.startsWith("/farmacia")) return "pharmacy";
  return null;
}

function verticalForAccessCheck(user: User): string | null {
  if (user.platformRole === "super_admin") return readBrowserVertical();
  return user.tenantVertical ?? readBrowserVertical();
}

export function hasModuleAccess(user: User | null | undefined, pathOrModule: string): boolean {
  if (!user) return false;

  const module = (ALL_USER_MODULES.some((item) => item.key === pathOrModule)
    ? pathOrModule
    : moduleForPath(pathOrModule)) as UserModuleKey | null;

  // Módulos verticais nunca podem vazar para tenants de outro nicho, mesmo
  // quando a permissão antiga ainda esteja salva no usuário.
  if (module === PHARMACY_MODULE && !isPharmacyVertical(verticalForAccessCheck(user))) {
    return false;
  }

  if (user.platformRole === "super_admin" || user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;
  if (!module) return true;

  const granted = Array.isArray(user.permissions)
    ? user.permissions
    : modulesForFunction(user.userFunction, user.tenantVertical);
  return granted.includes(module);
}
