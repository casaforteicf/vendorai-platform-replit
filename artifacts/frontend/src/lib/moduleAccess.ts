import type { User, UserFunction } from "@workspace/api-client-react";

export const USER_MODULES = [
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

export type UserModuleKey = (typeof USER_MODULES)[number]["key"];

const ALL = USER_MODULES.map((item) => item.key);

export const DEFAULT_MODULES_BY_FUNCTION: Record<UserFunction, UserModuleKey[]> = {
  administrador: ALL,
  vendedor: ["dashboard", "leads", "prospector", "deals", "conversations", "agenda", "proposals", "catalog"],
  financeiro: ["dashboard", "deals", "proposals", "catalog", "erp", "analytics"],
  suporte: ["dashboard", "leads", "prospector", "conversations", "agenda", "knowledge"],
  entrega: ["dashboard", "deals", "deliveries", "proposals"],
  outro: ["dashboard", "leads", "prospector", "deals", "conversations", "agenda", "proposals", "catalog", "erp", "analytics", "revenue_scout", "pharmacy"],
};

export function modulesForFunction(fn?: UserFunction | null): UserModuleKey[] {
  return [...DEFAULT_MODULES_BY_FUNCTION[fn ?? "outro"]];
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
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/base-conhecimento")) return "knowledge";
  if (path.startsWith("/analytics") || path.startsWith("/relatorios")) return "analytics";
  if (path.startsWith("/usuarios") || path.startsWith("/organizacao")) return "team";
  if (path.startsWith("/configuracoes") || path.startsWith("/guia-implantacao")) return "settings";
  if (path.startsWith("/content") || path.startsWith("/campanhas") || path.startsWith("/video")) return "content";
  if (path.startsWith("/scout")) return "revenue_scout";
  if (path.startsWith("/farmacia")) return "pharmacy";
  return null;
}

export function hasModuleAccess(user: User | null | undefined, pathOrModule: string): boolean {
  if (!user) return false;
  if (user.platformRole === "super_admin" || user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;
  const module = (USER_MODULES.some((item) => item.key === pathOrModule) ? pathOrModule : moduleForPath(pathOrModule)) as UserModuleKey | null;
  if (!module) return true;
  const granted = Array.isArray(user.permissions) ? user.permissions : modulesForFunction(user.userFunction);
  return granted.includes(module);
}
