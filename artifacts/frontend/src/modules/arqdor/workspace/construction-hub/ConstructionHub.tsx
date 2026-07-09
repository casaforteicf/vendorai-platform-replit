import React, { useState } from "react";
import { AIConstructionPanel } from "./AIConstructionPanel";
import { ChecklistPanel } from "./ChecklistPanel";
import { ConstructionDashboard } from "./ConstructionDashboard";
import { FinancialSchedule } from "./FinancialSchedule";
import { MeasurementPanel } from "./MeasurementPanel";
import { NonConformityPanel } from "./NonConformityPanel";
import { PhotoGallery } from "./PhotoGallery";
import { PhysicalSchedule } from "./PhysicalSchedule";
import { SiteApprovals } from "./SiteApprovals";
import { SiteDiary } from "./SiteDiary";
import { TeamManagement } from "./TeamManagement";
import type { ConstructionView } from "./constructionTypes";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: ConstructionView; setView: (view: ConstructionView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: ConstructionView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "diary", label: "Diário" },
    { id: "schedule", label: "Cronograma" },
    { id: "financial", label: "Financeiro" },
    { id: "teams", label: "Equipes" },
    { id: "measurements", label: "Medições" },
    { id: "checklists", label: "Checklists" },
    { id: "nonconformities", label: "NCs" },
    { id: "photos", label: "Fotos" },
    { id: "approvals", label: "Aprovações" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Construction Hub</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Obra e Execução</h1>
          <p className="mt-1 text-sm text-slate-500">Diário, cronogramas, equipes, medições, qualidade, fotos e aprovações.</p>
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

          <button type="button" onClick={() => onNavigate?.("bim")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            BIM
          </button>
        </div>
      </div>
    </header>
  );
}

export default function ConstructionHub({ onNavigate }: Props) {
  const [view, setView] = useState<ConstructionView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <ConstructionDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <PhysicalSchedule />
                <SiteDiary />
                <NonConformityPanel />
              </div>
              <AIConstructionPanel />
            </main>
          </>
        ) : null}

        {view === "diary" ? <SiteDiary /> : null}
        {view === "schedule" ? <PhysicalSchedule /> : null}
        {view === "financial" ? <FinancialSchedule /> : null}
        {view === "teams" ? <TeamManagement /> : null}
        {view === "measurements" ? <MeasurementPanel /> : null}
        {view === "checklists" ? <ChecklistPanel /> : null}
        {view === "nonconformities" ? <NonConformityPanel /> : null}
        {view === "photos" ? <PhotoGallery /> : null}
        {view === "approvals" ? <SiteApprovals /> : null}
        {view === "ai" ? <AIConstructionPanel /> : null}
      </div>
    </div>
  );
}
