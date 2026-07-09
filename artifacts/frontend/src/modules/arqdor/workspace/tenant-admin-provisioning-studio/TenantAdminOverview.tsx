import React from "react";
import { auditEvents, featureFlags, integrations, tenants } from "./tenantAdminData";
import { AdminMetricCard } from "./AdminMetricCard";
import { FeatureFlagsPanel } from "./FeatureFlagsPanel";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { TenantAccountsPanel } from "./TenantAccountsPanel";

export function TenantAdminOverview() {
  const activeTenants = tenants.filter((tenant) => tenant.status === "active").length;
  const attentionTenants = tenants.filter((tenant) => tenant.status === "attention" || tenant.health === "risk").length;
  const activeFlags = featureFlags.filter((flag) => flag.status === "active").length;
  const attentionIntegrations = integrations.filter((integration) => integration.status === "attention" || integration.status === "pending").length;
  const events = auditEvents.length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard label="Tenants ativos" value={`${activeTenants}/${tenants.length}`} description="Contas operando no ARQDOR." />
        <AdminMetricCard label="Tenants atenção" value={String(attentionTenants)} description="Contas que exigem ação." />
        <AdminMetricCard label="Feature flags" value={`${activeFlags}/${featureFlags.length}`} description="Recursos ativos em rollout." />
        <AdminMetricCard label="Integrações atenção" value={String(attentionIntegrations)} description="Canais pendentes ou parciais." />
        <AdminMetricCard label="Eventos auditados" value={String(events)} description="Rastreabilidade recente." />
      </section>

      <TenantAccountsPanel />
      <FeatureFlagsPanel />
      <SystemHealthPanel />
    </main>
  );
}
