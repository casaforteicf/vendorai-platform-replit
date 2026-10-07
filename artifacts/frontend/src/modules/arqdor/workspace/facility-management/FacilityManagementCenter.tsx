import React, { useState } from "react";
import { AIFacilityPanel } from "./AIFacilityPanel";
import { AssetInventory } from "./AssetInventory";
import { DocumentCenter } from "./DocumentCenter";
import { FacilityDashboard } from "./FacilityDashboard";
import { MaintenanceHistory } from "./MaintenanceHistory";
import { OwnerManual } from "./OwnerManual";
import { OwnerPortal } from "./OwnerPortal";
import { PreventiveSchedule } from "./PreventiveSchedule";
import { ServiceTickets } from "./ServiceTickets";
import { WarrantyCenter } from "./WarrantyCenter";
import type { FacilityView } from "./facilityTypes";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: FacilityView; setView: (view: FacilityView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: FacilityView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "manual", label: "Manual" },
    { id: "warranties", label: "Garantias" },
    { id: "assets", label: "Inventário" },
    { id: "maintenance", label: "Manutenção" },
    { id: "tickets", label: "Chamados" },
    { id: "schedule", label: "Agenda" },
    { id: "owner", label: "Proprietário" },
    { id: "documents", label: "Documentos" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Facility Management</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Operação e Manutenção</h1>
          <p className="mt-1 text-sm text-slate-500">Manual, garantias, ativos, manutenção, chamados, documentos e portal do proprietário.</p>
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

          <button type="button" onClick={() => onNavigate?.("smart-building")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Smart Building
          </button>
        </div>
      </div>
    </header>
  );
}

export default function FacilityManagementCenter({ arqState, onNavigate }: Props) {
  const [view, setView] = useState<FacilityView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <FacilityDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <OwnerManual projectId={arqState?.projectId ?? null} />
                <AssetInventory />
                <ServiceTickets />
              </div>
              <AIFacilityPanel />
            </main>
          </>
        ) : null}

        {view === "manual" ? <OwnerManual projectId={arqState?.projectId ?? null} /> : null}
        {view === "warranties" ? <WarrantyCenter /> : null}
        {view === "assets" ? <AssetInventory /> : null}
        {view === "maintenance" ? <MaintenanceHistory /> : null}
        {view === "tickets" ? <ServiceTickets /> : null}
        {view === "schedule" ? <PreventiveSchedule /> : null}
        {view === "owner" ? <OwnerPortal /> : null}
        {view === "documents" ? <DocumentCenter /> : null}
        {view === "ai" ? <AIFacilityPanel /> : null}
      </div>
    </div>
  );
}
