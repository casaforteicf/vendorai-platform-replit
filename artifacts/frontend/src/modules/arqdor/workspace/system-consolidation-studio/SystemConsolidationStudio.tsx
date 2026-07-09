import React, { useMemo, useState } from "react";
import { ApiMatrixPanel } from "./ApiMatrixPanel";
import { ConsolidationOverview } from "./ConsolidationOverview";
import { DataModelPanel } from "./DataModelPanel";
import { HandoffPanel } from "./HandoffPanel";
import { IntegrationBacklogPanel } from "./IntegrationBacklogPanel";
import { MockRealPanel } from "./MockRealPanel";
import { ModuleInventoryPanel } from "./ModuleInventoryPanel";
import { PriorityRoadmapPanel } from "./PriorityRoadmapPanel";
import { ReleaseGatesPanel } from "./ReleaseGatesPanel";
import { TestingPanel } from "./TestingPanel";
import type { ConsolidationView } from "./consolidationTypes";
import { clientName, getProject, projectTitle } from "./consolidationUtils";

type SystemConsolidationStudioProps = {
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
  view: ConsolidationView;
  setView: (view: ConsolidationView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: ConsolidationView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "inventory", label: "Inventário" },
    { id: "mock-real", label: "Mock → Real" },
    { id: "api", label: "API" },
    { id: "data", label: "Dados" },
    { id: "integration", label: "Integração" },
    { id: "testing", label: "QA" },
    { id: "priorities", label: "Prioridades" },
    { id: "release", label: "Release" },
    { id: "handoff", label: "Handoff" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 028 • System Consolidation Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Real Integration Plan</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • separação entre interface, mock, backend real e plano de consolidação.
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
            onClick={() => onNavigate?.("integration-automation")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Integrações
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: ConsolidationView }) {
  if (view === "inventory") return <ModuleInventoryPanel />;
  if (view === "mock-real") return <MockRealPanel />;
  if (view === "api") return <ApiMatrixPanel />;
  if (view === "data") return <DataModelPanel />;
  if (view === "integration") return <IntegrationBacklogPanel />;
  if (view === "testing") return <TestingPanel />;
  if (view === "priorities") return <PriorityRoadmapPanel />;
  if (view === "release") return <ReleaseGatesPanel />;
  if (view === "handoff") return <HandoffPanel />;
  return <ConsolidationOverview />;
}

export default function SystemConsolidationStudio({ arqState, onNavigate }: SystemConsolidationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<ConsolidationView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
