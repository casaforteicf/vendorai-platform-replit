export type Ui20Module = { moduleKey: string; isEnabled: boolean; hasOverride?: boolean; commerciallyEntitled?: boolean };
export type Ui20Service = "home" | "crm" | "marketing" | "erp" | "ia" | "marketplace" | "arqdor" | "support" | "settings";

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
