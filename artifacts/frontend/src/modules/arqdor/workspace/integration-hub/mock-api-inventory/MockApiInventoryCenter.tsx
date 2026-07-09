import React, { useState } from "react";
import { AIInventoryPanel } from "./AIInventoryPanel";
import { ApiInventoryPanel } from "./ApiInventoryPanel";
import { DataContractsPanel } from "./DataContractsPanel";
import { InventoryChecklist } from "./InventoryChecklist";
import { InventoryDashboard } from "./InventoryDashboard";
import { InventoryReports } from "./InventoryReports";
import { InventoryRisksPanel } from "./InventoryRisksPanel";
import { MigrationPriorityPanel } from "./MigrationPriorityPanel";
import { MockInventoryPanel } from "./MockInventoryPanel";
import type { InventoryView } from "./mockApiInventoryTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: InventoryView; setView: (view: InventoryView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: InventoryView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "mocks", label: "Mocks" },
    { id: "apis", label: "APIs" },
    { id: "priority", label: "Prioridade" },
    { id: "contracts", label: "Contratos" },
    { id: "migration", label: "Migração" },
    { id: "risks", label: "Riscos" },
    { id: "checklist", label: "Checklist" },
    { id: "reports", label: "Relatórios" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 019A — Mock/API Inventory</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Inventário Mock → API Real</h1>
          <p className="mt-1 text-sm text-slate-500">Mapeamento de mocks, APIs, contratos, riscos e ordem segura para remover dados simulados.</p>
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

          <button type="button" onClick={() => onNavigate?.("migration")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Migration Audit
          </button>
        </div>
      </div>
    </header>
  );
}

export default function MockApiInventoryCenter({ onNavigate }: Props) {
  const [view, setView] = useState<InventoryView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <InventoryDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <MockInventoryPanel />
                <ApiInventoryPanel />
                <MigrationPriorityPanel />
              </div>
              <AIInventoryPanel />
            </main>
          </>
        ) : null}

        {view === "mocks" ? <MockInventoryPanel /> : null}
        {view === "apis" ? <ApiInventoryPanel /> : null}
        {view === "priority" || view === "migration" ? <MigrationPriorityPanel /> : null}
        {view === "contracts" ? <DataContractsPanel /> : null}
        {view === "risks" ? <InventoryRisksPanel /> : null}
        {view === "checklist" ? <InventoryChecklist /> : null}
        {view === "reports" ? <InventoryReports /> : null}
        {view === "ai" ? <AIInventoryPanel /> : null}
      </div>
    </div>
  );
}
