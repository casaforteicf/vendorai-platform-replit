import React, { useState } from "react";
import { AIAgentMonitor } from "./AIAgentMonitor";
import { AICommandInsights } from "./AICommandInsights";
import { AICommandReports } from "./AICommandReports";
import { AIDecisionBoard } from "./AIDecisionBoard";
import { AIMemoryCenter } from "./AIMemoryCenter";
import { MetricCard } from "./MetricCard";
import { PlaybookManager } from "./PlaybookManager";
import { PromptLibrary } from "./PromptLibrary";
import { TrainingCenter } from "./TrainingCenter";
import { agents, decisions, memories, playbooks } from "./aiCommandData";
import type { CommandView } from "./aiCommandTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: CommandView; setView: (view: CommandView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: CommandView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "agents", label: "Agentes" },
    { id: "decisions", label: "Decisões" },
    { id: "prompts", label: "Prompts" },
    { id: "playbooks", label: "Playbooks" },
    { id: "memory", label: "Memória" },
    { id: "training", label: "Treinamento" },
    { id: "reports", label: "Relatórios" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Command Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Cérebro Operacional ARQDOR</h1>
          <p className="mt-1 text-sm text-slate-500">Agentes, decisões, prompts, playbooks, memória, treinamento e relatórios.</p>
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

export default function AICommandIntelligence({ onNavigate }: Props) {
  const [view, setView] = useState<CommandView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Agentes" value={String(agents.length)} description="Agentes IA ativos." />
              <MetricCard label="Decisões" value={String(decisions.length)} description="Decisões registradas." />
              <MetricCard label="Playbooks" value={String(playbooks.length)} description="Fluxos inteligentes." />
              <MetricCard label="Memórias" value={String(memories.length)} description="Conhecimento operacional." />
            </section>

            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <AIAgentMonitor />
                <AIDecisionBoard />
              </div>
              <AICommandInsights />
            </main>
          </>
        ) : null}

        {view === "agents" ? <AIAgentMonitor /> : null}
        {view === "decisions" ? <AIDecisionBoard /> : null}
        {view === "prompts" ? <PromptLibrary /> : null}
        {view === "playbooks" ? <PlaybookManager /> : null}
        {view === "memory" ? <AIMemoryCenter /> : null}
        {view === "training" ? <TrainingCenter /> : null}
        {view === "reports" ? <AICommandReports /> : null}
      </div>
    </div>
  );
}
