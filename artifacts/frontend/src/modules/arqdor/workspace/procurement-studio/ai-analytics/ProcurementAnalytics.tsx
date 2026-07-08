import React, { useState } from "react";
import { CostOptimization } from "./CostOptimization";
import { LeadTimeAnalytics } from "./LeadTimeAnalytics";
import { ProcurementAlerts } from "./ProcurementAlerts";
import { ProcurementAutomation } from "./ProcurementAutomation";
import { ProcurementForecast } from "./ProcurementForecast";
import { ProcurementKPIs } from "./ProcurementKPIs";
import { ProcurementRecommendations } from "./ProcurementRecommendations";
import { ProcurementReports } from "./ProcurementReports";
import { RiskAnalysis } from "./RiskAnalysis";
import { SupplierPerformance } from "./SupplierPerformance";
import type { AnalyticsView } from "./procurementAnalyticsTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

export default function ProcurementAnalytics({ onNavigate }: Props) {
  const [view, setView] = useState<AnalyticsView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Procurement AI & Analytics</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Inteligência de Compras</h1>
              <p className="mt-1 text-sm text-slate-500">KPIs, performance, economia, forecast, riscos, automações e relatórios.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                ["dashboard", "Dashboard"],
                ["kpis", "KPIs"],
                ["suppliers", "Fornecedores"],
                ["leadtime", "Lead time"],
                ["cost", "Economia"],
                ["forecast", "Forecast"],
                ["risks", "Riscos"],
                ["automation", "Automações"],
                ["reports", "Relatórios"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id as AnalyticsView)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    view === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}

              <button type="button" onClick={() => onNavigate?.("compras")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
                Voltar compras
              </button>
            </div>
          </div>
        </header>

        {view === "dashboard" ? (
          <>
            <ProcurementKPIs />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <CostOptimization />
                <SupplierPerformance />
                <ProcurementForecast />
              </div>
              <div className="space-y-5">
                <ProcurementAlerts />
                <ProcurementRecommendations />
              </div>
            </main>
          </>
        ) : null}

        {view === "kpis" ? <ProcurementKPIs /> : null}
        {view === "suppliers" ? <SupplierPerformance /> : null}
        {view === "leadtime" ? <LeadTimeAnalytics /> : null}
        {view === "cost" ? <CostOptimization /> : null}
        {view === "forecast" ? <ProcurementForecast /> : null}
        {view === "risks" ? <RiskAnalysis /> : null}
        {view === "automation" ? <ProcurementAutomation /> : null}
        {view === "reports" ? <ProcurementReports /> : null}
      </div>
    </div>
  );
}
