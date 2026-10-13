export type Ui20Module = { moduleKey: string; isEnabled: boolean; hasOverride?: boolean; commerciallyEntitled?: boolean };
export type Ui20Service = "home" | "crm" | "omnichannel" | "prospecting" | "agenda" | "commercial" | "marketing" | "erp" | "ia" | "intelligence" | "works" | "library" | "marketplace" | "arqdor" | "support" | "settings";

/** Presentation filtering only. Never use this to authorize an API or route. */
export function getUi20VisibleServices(input: {
  modules?: Ui20Module[];
  isAdmin?: boolean;
  arqdorEligible?: boolean;
  loading?: boolean;
}): Set<Ui20Service> {
  const { modules = [], isAdmin = false, arqdorEligible = false, loading = false } = input;
  // Until module inventory is confirmed, only the universal shell is shown.
  const visible = new Set<Ui20Service>(["home", "support"]);
  if (loading) return visible;
  visible.add("crm");
  if (permittedModule("scheduler")) visible.add("agenda");
  if (permittedModule("leads")) visible.add("prospecting");
  // Catálogo e propostas podem estar habilitados mesmo sem acesso ao módulo Leads.
  if (["leads", "catalog", "proposals"].some(permittedModule)) visible.add("commercial");
  if (permittedModule("omnichannel") || permittedModule("conversations")) visible.add("omnichannel");
  if (permittedModule("business_intelligence") || permittedModule("analytics")) visible.add("intelligence");
  if (permittedModule("obras") || permittedModule("works")) visible.add("works");
  if (permittedModule("media_library") || permittedModule("library")) visible.add("library");
  visible.add("marketing");
  if (isAdmin && permittedModule("settings")) visible.add("settings");
  function permittedModule(key: string) {
    const row = modules.find((module) => module.moduleKey === key);
    return Boolean(row?.isEnabled && row.commerciallyEntitled !== false);
  }
  if (permittedModule("financeiro")) visible.add("erp");
  if (arqdorEligible && permittedModule("arch")) visible.add("arqdor");
  // Real NAV_MODULE_CATALOG keys; never infer IA access from missing entries.
  if (["sdr", "vendor_brain", "knowledge_graph"].some(permittedModule)) visible.add("ia");
  if (!permittedModule("leads")) visible.delete("crm");
  if (!["content", "campaigns", "analytics", "content_autopilot"].some(permittedModule)) visible.delete("marketing");
  // O catálogo de módulos é exclusivo do Superadmin, fora da navegação operacional.
  return visible;
}
