import React, { useMemo, useState } from "react";
import { AuditLogPanel } from "./AuditLogPanel";
import { FeatureFlagsPanel } from "./FeatureFlagsPanel";
import { IntegrationStatusPanel } from "./IntegrationStatusPanel";
import { ProvisioningPanel } from "./ProvisioningPanel";
import { RolesPanel } from "./RolesPanel";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { TenantAccountsPanel } from "./TenantAccountsPanel";
import { TenantAdminOverview } from "./TenantAdminOverview";
import { UsageLimitsPanel } from "./UsageLimitsPanel";
import { UsersPanel } from "./UsersPanel";
import type { AdminView } from "./tenantAdminTypes";
import { clientName, getProject, projectTitle } from "./tenantAdminUtils";

type TenantAdminProvisioningStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function Header({
  project,
  view,
  setView,
  onNavigate,
}: {
  project: any;
  view: AdminView;
  setView: (view: AdminView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: AdminView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "tenants", label: "Tenants" },
    { id: "provisioning", label: "Provisioning" },
    { id: "users", label: "Usuários" },
    { id: "roles", label: "Permissões" },
    { id: "features", label: "Features" },
    { id: "limits", label: "Limites" },
    { id: "integrations", label: "Integrações" },
    { id: "audit", label: "Auditoria" },
    { id: "health", label: "Health" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 026 • Tenant Admin & Provisioning Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai SaaS Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • tenants, usuários, permissões, features, limites, integrações e auditoria.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.("billing")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Billing
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: AdminView }) {
  if (view === "tenants") return <TenantAccountsPanel />;
  if (view === "provisioning") return <ProvisioningPanel />;
  if (view === "users") return <UsersPanel />;
  if (view === "roles") return <RolesPanel />;
  if (view === "features") return <FeatureFlagsPanel />;
  if (view === "limits") return <UsageLimitsPanel />;
  if (view === "integrations") return <IntegrationStatusPanel />;
  if (view === "audit") return <AuditLogPanel />;
  if (view === "health") return <SystemHealthPanel />;
  return <TenantAdminOverview />;
}

export default function TenantAdminProvisioningStudio({ arqState, onNavigate }: TenantAdminProvisioningStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<AdminView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
