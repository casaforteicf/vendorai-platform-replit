import React, { useMemo, useState } from "react";
import { CampaignBoardPanel } from "./CampaignBoardPanel";
import { ContentPlanPanel } from "./ContentPlanPanel";
import { DemoScriptPanel } from "./DemoScriptPanel";
import { LaunchAnalyticsPanel } from "./LaunchAnalyticsPanel";
import { LaunchOverview } from "./LaunchOverview";
import { OfferBuilderPanel } from "./OfferBuilderPanel";
import { OnboardingPlanPanel } from "./OnboardingPlanPanel";
import { SalesPlaybookPanel } from "./SalesPlaybookPanel";
import { SegmentStrategyPanel } from "./SegmentStrategyPanel";
import type { LaunchView } from "./launchTypes";
import { clientName, getProject, projectTitle } from "./launchUtils";

type LaunchStudioProps = {
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
  view: LaunchView;
  setView: (view: LaunchView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: LaunchView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "offer", label: "Oferta" },
    { id: "segments", label: "Segmentos" },
    { id: "demo", label: "Demo" },
    { id: "content", label: "Conteúdo" },
    { id: "campaigns", label: "Campanhas" },
    { id: "sales", label: "Vendas" },
    { id: "onboarding", label: "Onboarding" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 022 • Launch Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Go-to-Market</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • oferta, demo, vendas, campanhas e pilotos para lançamento.
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
            onClick={() => onNavigate?.("release-candidate")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            RC
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: LaunchView }) {
  if (view === "offer") return <OfferBuilderPanel />;
  if (view === "segments") return <SegmentStrategyPanel />;
  if (view === "demo") return <DemoScriptPanel />;
  if (view === "content") return <ContentPlanPanel />;
  if (view === "campaigns") return <CampaignBoardPanel />;
  if (view === "sales") return <SalesPlaybookPanel />;
  if (view === "onboarding") return <OnboardingPlanPanel />;
  if (view === "analytics") return <LaunchAnalyticsPanel />;
  return <LaunchOverview />;
}

export default function LaunchStudio({ arqState, onNavigate }: LaunchStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<LaunchView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
