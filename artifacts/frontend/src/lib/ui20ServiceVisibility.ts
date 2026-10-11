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
  visible.add("marketplace");
  if (isAdmin) visible.add("settings");
  const permitted = (key: string) => {
    const row = modules.find((module) => module.moduleKey === key);
    return Boolean(row?.isEnabled && row.commerciallyEntitled !== false);
  };
  const notExplicitlyDisabled = (key: string) =>
    !modules.some((module) => module.moduleKey === key && (module.hasOverride === true && !module.isEnabled || module.commerciallyEntitled === false));
  if (permitted("financeiro")) visible.add("erp");
  if (arqdorEligible && notExplicitlyDisabled("arch")) visible.add("arqdor");
  if (notExplicitlyDisabled("agents")) visible.add("ia");
  for (const [service, key] of [["crm", "leads"], ["marketing", "marketing"], ["marketplace", "marketplace"]] as const) {
    if (!notExplicitlyDisabled(key)) visible.delete(service);
  }
  return visible;
}
