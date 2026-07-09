import React, { useMemo, useState } from "react";
import { AcceptanceGatePanel } from "./AcceptanceGatePanel";
import { BugTriagePanel } from "./BugTriagePanel";
import { IntegrationAuditPanel } from "./IntegrationAuditPanel";
import { LaunchPlanPanel } from "./LaunchPlanPanel";
import { ModuleReadinessPanel } from "./ModuleReadinessPanel";
import { PerformancePanel } from "./PerformancePanel";
import { QAChecklistPanel } from "./QAChecklistPanel";
import { ReleaseOverview } from "./ReleaseOverview";
import { SecurityReviewPanel } from "./SecurityReviewPanel";
import type { ReleaseView } from "./releaseTypes";
import { clientName, getProject, projectTitle } from "./releaseUtils";

type ReleaseCandidateCenterProps = {
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
  view: ReleaseView;
  setView: (view: ReleaseView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: ReleaseView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "modules", label: "Módulos" },
    { id: "qa", label: "QA" },
    { id: "bugs", label: "Bugs" },
    { id: "integrations", label: "Integrações" },
    { id: "security", label: "Segurança" },
    { id: "performance", label: "Performance" },
    { id: "launch", label: "Lançamento" },
    { id: "acceptance", label: "Gates" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 021 • Release Candidate</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Launch Control</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • validação final para transformar o ARQDOR em produto demonstrável.
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
            onClick={() => onNavigate?.("ai-enterprise")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            AI Core
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: ReleaseView }) {
  if (view === "modules") return <ModuleReadinessPanel />;
  if (view === "qa") return <QAChecklistPanel />;
  if (view === "bugs") return <BugTriagePanel />;
  if (view === "integrations") return <IntegrationAuditPanel />;
  if (view === "security") return <SecurityReviewPanel />;
  if (view === "performance") return <PerformancePanel />;
  if (view === "launch") return <LaunchPlanPanel />;
  if (view === "acceptance") return <AcceptanceGatePanel />;
  return <ReleaseOverview />;
}

export default function ReleaseCandidateCenter({ arqState, onNavigate }: ReleaseCandidateCenterProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<ReleaseView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
