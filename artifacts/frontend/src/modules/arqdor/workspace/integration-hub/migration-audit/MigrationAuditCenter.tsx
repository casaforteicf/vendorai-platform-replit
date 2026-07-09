import React, { useState } from "react";
import { AIMigrationPanel } from "./AIMigrationPanel";
import { AuditTraceCenter } from "./AuditTraceCenter";
import { MigrationCenter } from "./MigrationCenter";
import { MigrationChecklist } from "./MigrationChecklist";
import { MigrationDashboard } from "./MigrationDashboard";
import { MigrationReports } from "./MigrationReports";
import { MigrationTimeline } from "./MigrationTimeline";
import { MockInventory } from "./MockInventory";
import { RollbackCenter } from "./RollbackCenter";
import { TraceabilityMap } from "./TraceabilityMap";
import type { MigrationView } from "./migrationTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: MigrationView; setView: (view: MigrationView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: MigrationView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "migration", label: "Migração" },
    { id: "mocks", label: "Mocks" },
    { id: "audit", label: "Auditoria" },
    { id: "trace", label: "Trace" },
    { id: "timeline", label: "Timeline" },
    { id: "rollback", label: "Rollback" },
    { id: "checklist", label: "Checklist" },
    { id: "reports", label: "Relatórios" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 017D — Migration + Audit + Timeline</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Migration Audit Center</h1>
          <p className="mt-1 text-sm text-slate-500">Migração mock → API real, auditoria, rastreabilidade, rollback, checklist e timeline.</p>
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

          <button type="button" onClick={() => onNavigate?.("integration")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Integration Hub
          </button>
        </div>
      </div>
    </header>
  );
}

export default function MigrationAuditCenter({ onNavigate }: Props) {
  const [view, setView] = useState<MigrationView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <MigrationDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <MigrationCenter />
                <MockInventory />
                <TraceabilityMap />
              </div>
              <AIMigrationPanel />
            </main>
          </>
        ) : null}

        {view === "migration" ? <MigrationCenter /> : null}
        {view === "mocks" ? <MockInventory /> : null}
        {view === "audit" ? <AuditTraceCenter /> : null}
        {view === "trace" ? <TraceabilityMap /> : null}
        {view === "timeline" ? <MigrationTimeline /> : null}
        {view === "rollback" ? <RollbackCenter /> : null}
        {view === "checklist" ? <MigrationChecklist /> : null}
        {view === "reports" ? <MigrationReports /> : null}
        {view === "ai" ? <AIMigrationPanel /> : null}
      </div>
    </div>
  );
}
