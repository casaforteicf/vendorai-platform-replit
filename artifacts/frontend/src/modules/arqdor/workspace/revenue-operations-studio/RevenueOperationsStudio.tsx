import React, { useMemo, useState } from "react";
import { CustomerSuccessPanel } from "./CustomerSuccessPanel";
import { DemoCalendarPanel } from "./DemoCalendarPanel";
import { PartnerRevenuePanel } from "./PartnerRevenuePanel";
import { PipelineBoardPanel } from "./PipelineBoardPanel";
import { ProposalCenterPanel } from "./ProposalCenterPanel";
import { RevenueForecastPanel } from "./RevenueForecastPanel";
import { RevenueOverview } from "./RevenueOverview";
import { SalesPlaybookRevenuePanel } from "./SalesPlaybookRevenuePanel";
import { SubscriptionMetricsPanel } from "./SubscriptionMetricsPanel";
import type { RevenueView } from "./revenueTypes";
import { clientName, getProject, projectTitle } from "./revenueUtils";

type RevenueOperationsStudioProps = {
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
  view: RevenueView;
  setView: (view: RevenueView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: RevenueView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "pipeline", label: "Pipeline" },
    { id: "demos", label: "Demos" },
    { id: "proposals", label: "Propostas" },
    { id: "subscriptions", label: "MRR" },
    { id: "partners", label: "Parcerias" },
    { id: "success", label: "Success" },
    { id: "forecast", label: "Forecast" },
    { id: "playbook", label: "Playbook" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 024 • Revenue Operations Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Revenue Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • pipeline, propostas, MRR, parceiros, CS e forecast.
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
            onClick={() => onNavigate?.("pilot-operations")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Pilotos
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: RevenueView }) {
  if (view === "pipeline") return <PipelineBoardPanel />;
  if (view === "demos") return <DemoCalendarPanel />;
  if (view === "proposals") return <ProposalCenterPanel />;
  if (view === "subscriptions") return <SubscriptionMetricsPanel />;
  if (view === "partners") return <PartnerRevenuePanel />;
  if (view === "success") return <CustomerSuccessPanel />;
  if (view === "forecast") return <RevenueForecastPanel />;
  if (view === "playbook") return <SalesPlaybookRevenuePanel />;
  return <RevenueOverview />;
}

export default function RevenueOperationsStudio({ arqState, onNavigate }: RevenueOperationsStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<RevenueView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
