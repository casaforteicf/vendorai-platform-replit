import React, { useState } from "react";
import { BusinessIntelligence } from "./BusinessIntelligence";
import { CapacityPlanning } from "./CapacityPlanning";
import { ExecutiveReports } from "./ExecutiveReports";
import { KPIEngine } from "./KPIEngine";
import { PortfolioManager } from "./PortfolioManager";
import { PredictiveAnalytics } from "./PredictiveAnalytics";
import { RealtimeMonitor } from "./RealtimeMonitor";
import { RiskCenter } from "./RiskCenter";
import { StrategyPanel } from "./StrategyPanel";
import type { ExecutiveView } from "./executiveTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: ExecutiveView; setView: (view: ExecutiveView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: ExecutiveView; label: string }> = [
    { id: "cockpit", label: "Cockpit" },
    { id: "bi", label: "BI" },
    { id: "predictive", label: "Preditivo" },
    { id: "risks", label: "Riscos" },
    { id: "capacity", label: "Capacidade" },
    { id: "portfolio", label: "Portfólio" },
    { id: "realtime", label: "Realtime" },
    { id: "strategy", label: "Estratégia" },
    { id: "reports", label: "Relatórios" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Executive Command Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Cockpit Executivo ARQDOR</h1>
          <p className="mt-1 text-sm text-slate-500">KPIs, portfólio, riscos, capacidade, predição, realtime e estratégia.</p>
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

export default function ExecutiveCockpit({ onNavigate }: Props) {
  const [view, setView] = useState<ExecutiveView>("cockpit");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "cockpit" ? (
          <>
            <KPIEngine />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <BusinessIntelligence />
                <PortfolioManager />
                <PredictiveAnalytics />
              </div>
              <div className="space-y-5">
                <StrategyPanel />
                <RealtimeMonitor />
              </div>
            </main>
          </>
        ) : null}

        {view === "bi" ? <BusinessIntelligence /> : null}
        {view === "predictive" ? <PredictiveAnalytics /> : null}
        {view === "risks" ? <RiskCenter /> : null}
        {view === "capacity" ? <CapacityPlanning /> : null}
        {view === "portfolio" ? <PortfolioManager /> : null}
        {view === "realtime" ? <RealtimeMonitor /> : null}
        {view === "strategy" ? <StrategyPanel /> : null}
        {view === "reports" ? <ExecutiveReports /> : null}
      </div>
    </div>
  );
}
