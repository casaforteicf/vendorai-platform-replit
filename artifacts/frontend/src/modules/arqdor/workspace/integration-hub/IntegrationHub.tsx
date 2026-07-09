import React, { useState } from "react";
import { AIIntegrationPanel } from "./AIIntegrationPanel";
import { HandoffManager } from "./HandoffManager";
import { IntegrationDashboard } from "./IntegrationDashboard";
import { IntegrationHealth } from "./IntegrationHealth";
import { IntegrationTimeline } from "./IntegrationTimeline";
import { ModuleConnectionMap } from "./ModuleConnectionMap";
import { OrchestrationBoard } from "./OrchestrationBoard";
import { WorkflowEngine } from "./WorkflowEngine";
import type { IntegrationView } from "./integrationTypes";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: IntegrationView; setView: (view: IntegrationView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: IntegrationView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "workflow", label: "Workflow" },
    { id: "modules", label: "Módulos" },
    { id: "orchestration", label: "Orquestração" },
    { id: "handoff", label: "Handoff" },
    { id: "rules", label: "Regras" },
    { id: "timeline", label: "Timeline" },
    { id: "health", label: "Health" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 017A — Integration Hub</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Integração Total ARQDOR</h1>
          <p className="mt-1 text-sm text-slate-500">Fluxo único, handoffs, regras, módulos, timeline e saúde das integrações.</p>
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

export default function IntegrationHub({ onNavigate }: Props) {
  const [view, setView] = useState<IntegrationView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <IntegrationDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <WorkflowEngine />
                <HandoffManager />
                <ModuleConnectionMap />
              </div>
              <AIIntegrationPanel />
            </main>
          </>
        ) : null}

        {view === "workflow" ? <WorkflowEngine /> : null}
        {view === "modules" ? <ModuleConnectionMap /> : null}
        {view === "orchestration" || view === "rules" ? <OrchestrationBoard /> : null}
        {view === "handoff" ? <HandoffManager /> : null}
        {view === "timeline" ? <IntegrationTimeline /> : null}
        {view === "health" ? <IntegrationHealth /> : null}
        {view === "ai" ? <AIIntegrationPanel /> : null}
      </div>
    </div>
  );
}
