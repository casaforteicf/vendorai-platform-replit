import React, { useState } from "react";
import { ActionCenter } from "./ActionCenter";
import { AgentOrchestrator } from "./AgentOrchestrator";
import { ContextStorePanel } from "./ContextStorePanel";
import { CopilotDashboard } from "./CopilotDashboard";
import { CopilotPlaybooks } from "./CopilotPlaybooks";
import { CopilotReports } from "./CopilotReports";
import { HealthMonitor } from "./HealthMonitor";
import { MemoryPanel } from "./MemoryPanel";
import { RecommendationEngine } from "./RecommendationEngine";
import { UnifiedCopilotChat } from "./UnifiedCopilotChat";
import type { CopilotView } from "./copilotTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: CopilotView; setView: (view: CopilotView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: CopilotView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "chat", label: "Chat" },
    { id: "context", label: "Contexto" },
    { id: "agents", label: "Agentes" },
    { id: "actions", label: "Ações" },
    { id: "health", label: "Health" },
    { id: "memory", label: "Memória" },
    { id: "recommendations", label: "Recomendações" },
    { id: "playbooks", label: "Playbooks" },
    { id: "reports", label: "Relatórios" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 017C — Unified AI Copilot + Health Monitor</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR Unified Copilot</h1>
          <p className="mt-1 text-sm text-slate-500">Copiloto único, contexto global, agentes, ações, health monitor, memória e playbooks.</p>
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

export default function UnifiedCopilotCenter({ onNavigate }: Props) {
  const [view, setView] = useState<CopilotView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <CopilotDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <UnifiedCopilotChat />
                <ActionCenter />
                <HealthMonitor />
              </div>
              <RecommendationEngine />
            </main>
          </>
        ) : null}

        {view === "chat" ? <UnifiedCopilotChat /> : null}
        {view === "context" ? <ContextStorePanel /> : null}
        {view === "agents" ? <AgentOrchestrator /> : null}
        {view === "actions" ? <ActionCenter /> : null}
        {view === "health" ? <HealthMonitor /> : null}
        {view === "memory" ? <MemoryPanel /> : null}
        {view === "recommendations" ? <RecommendationEngine /> : null}
        {view === "playbooks" ? <CopilotPlaybooks /> : null}
        {view === "reports" ? <CopilotReports /> : null}
      </div>
    </div>
  );
}
