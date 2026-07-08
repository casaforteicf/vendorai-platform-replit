import React, { useState } from "react";
import { AIAuditPanel } from "./AIAuditPanel";
import { AuditCenter } from "./AuditCenter";
import { AutomationCenter } from "./AutomationCenter";
import { AutomationReports } from "./AutomationReports";
import { ExecutionLogs } from "./ExecutionLogs";
import { IncidentCenter } from "./IncidentCenter";
import { MetricCard } from "./MetricCard";
import { PermissionsCenter } from "./PermissionsCenter";
import { automationRules, auditEvents, executionLogs, incidents } from "./automationAuditData";
import type { AutomationAuditView } from "./automationAuditTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: AutomationAuditView; setView: (view: AutomationAuditView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: AutomationAuditView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "automations", label: "Automações" },
    { id: "rules", label: "Regras" },
    { id: "executions", label: "Execuções" },
    { id: "audit", label: "Auditoria" },
    { id: "permissions", label: "Permissões" },
    { id: "incidents", label: "Incidentes" },
    { id: "reports", label: "Relatórios" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Automation & Audit Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Automações e Auditoria</h1>
          <p className="mt-1 text-sm text-slate-500">Regras, execuções, permissões, incidentes e trilha de segurança.</p>
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

          <button type="button" onClick={() => onNavigate?.("operations")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Operations
          </button>
        </div>
      </div>
    </header>
  );
}

export default function AutomationAuditCenter({ onNavigate }: Props) {
  const [view, setView] = useState<AutomationAuditView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Automações" value={String(automationRules.length)} description="Regras cadastradas." />
              <MetricCard label="Execuções" value={String(executionLogs.length)} description="Logs recentes." />
              <MetricCard label="Eventos auditoria" value={String(auditEvents.length)} description="Eventos rastreados." />
              <MetricCard label="Incidentes" value={String(incidents.length)} description="Ocorrências abertas/históricas." />
            </section>

            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <AutomationCenter />
                <ExecutionLogs />
              </div>
              <AIAuditPanel />
            </main>
          </>
        ) : null}

        {view === "automations" || view === "rules" ? <AutomationCenter /> : null}
        {view === "executions" ? <ExecutionLogs /> : null}
        {view === "audit" ? <AuditCenter /> : null}
        {view === "permissions" ? <PermissionsCenter /> : null}
        {view === "incidents" ? <IncidentCenter /> : null}
        {view === "reports" ? <AutomationReports /> : null}
      </div>
    </div>
  );
}
