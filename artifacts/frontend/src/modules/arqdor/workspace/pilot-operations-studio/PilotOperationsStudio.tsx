import React, { useMemo, useState } from "react";
import { PilotAccountsPanel } from "./PilotAccountsPanel";
import { PilotFeedbackPanel } from "./PilotFeedbackPanel";
import { PilotHandoffPanel } from "./PilotHandoffPanel";
import { PilotHealthPanel } from "./PilotHealthPanel";
import { PilotOverview } from "./PilotOverview";
import { PilotProjectsPanel } from "./PilotProjectsPanel";
import { PilotRisksPanel } from "./PilotRisksPanel";
import { PilotSuccessPanel } from "./PilotSuccessPanel";
import { PilotTasksPanel } from "./PilotTasksPanel";
import type { PilotView } from "./pilotTypes";
import { clientName, getProject, projectTitle } from "./pilotUtils";

type PilotOperationsStudioProps = {
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
  view: PilotView;
  setView: (view: PilotView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: PilotView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "accounts", label: "Contas" },
    { id: "projects", label: "Projetos" },
    { id: "health", label: "Health" },
    { id: "tasks", label: "Tarefas" },
    { id: "feedback", label: "Feedback" },
    { id: "success", label: "Success" },
    { id: "risks", label: "Riscos" },
    { id: "handoff", label: "Handoff" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 023 • Pilot Operations Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Pilot Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • operação assistida dos primeiros clientes, projetos e feedbacks.
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
            onClick={() => onNavigate?.("launch")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Launch
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: PilotView }) {
  if (view === "accounts") return <PilotAccountsPanel />;
  if (view === "projects") return <PilotProjectsPanel />;
  if (view === "health") return <PilotHealthPanel />;
  if (view === "tasks") return <PilotTasksPanel />;
  if (view === "feedback") return <PilotFeedbackPanel />;
  if (view === "success") return <PilotSuccessPanel />;
  if (view === "risks") return <PilotRisksPanel />;
  if (view === "handoff") return <PilotHandoffPanel />;
  return <PilotOverview />;
}

export default function PilotOperationsStudio({ arqState, onNavigate }: PilotOperationsStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<PilotView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
