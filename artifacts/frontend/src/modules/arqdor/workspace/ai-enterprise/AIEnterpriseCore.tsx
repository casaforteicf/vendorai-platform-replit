import React, { useMemo, useState } from "react";
import { AIActionQueue } from "./AIActionQueue";
import { AIAgentGrid } from "./AIAgentGrid";
import { AIChatCopilot } from "./AIChatCopilot";
import { AICommandCenter } from "./AICommandCenter";
import { AIGovernancePanel } from "./AIGovernancePanel";
import { AIIntegrationMatrix } from "./AIIntegrationMatrix";
import { AIMemoryCenter } from "./AIMemoryCenter";
import { AIWorkflowMap } from "./AIWorkflowMap";
import type { AIView } from "./aiEnterpriseTypes";
import { clientName, getProject, projectTitle } from "./aiEnterpriseUtils";

type AIEnterpriseCoreProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function Header({
  project,
  view,
  setView,
  onNavigate,
}: {
  project: any;
  view: AIView;
  setView: (view: AIView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: AIView; label: string }> = [
    { id: "command", label: "Comando" },
    { id: "agents", label: "Agentes" },
    { id: "workflow", label: "Fluxo" },
    { id: "memory", label: "Memória" },
    { id: "actions", label: "Ações" },
    { id: "integrations", label: "Integrações" },
    { id: "governance", label: "Governança" },
    { id: "copilot", label: "Copilot" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 020 • AI Enterprise Core</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Cérebro ARQDOR.ai</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • IA transversal conectando render, especificação, orçamento, produção e cliente.
          </p>
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

          <button
            type="button"
            onClick={() => onNavigate?.("renders")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Render Studio
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: AIView }) {
  if (view === "agents") return <AIAgentGrid />;
  if (view === "workflow") return <AIWorkflowMap />;
  if (view === "memory") return <AIMemoryCenter />;
  if (view === "actions") return <AIActionQueue />;
  if (view === "integrations") return <AIIntegrationMatrix />;
  if (view === "governance") return <AIGovernancePanel />;
  if (view === "copilot") return <AIChatCopilot />;
  return <AICommandCenter />;
}

export default function AIEnterpriseCore({ arqState, onNavigate }: AIEnterpriseCoreProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<AIView>("command");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
