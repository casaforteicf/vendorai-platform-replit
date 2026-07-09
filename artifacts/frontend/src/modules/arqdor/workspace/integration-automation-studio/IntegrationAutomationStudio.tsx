import React, { useMemo, useState } from "react";
import { AutomationsPanel } from "./AutomationsPanel";
import { ChannelsPanel } from "./ChannelsPanel";
import { HealthPanel } from "./HealthPanel";
import { IntegrationLogsPanel } from "./IntegrationLogsPanel";
import { IntegrationOverview } from "./IntegrationOverview";
import { ProvidersPanel } from "./ProvidersPanel";
import { SecurityPanel } from "./SecurityPanel";
import { SyncJobsPanel } from "./SyncJobsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { WebhookPanel } from "./WebhookPanel";
import type { IntegrationView } from "./integrationTypes";
import { clientName, getProject, projectTitle } from "./integrationUtils";

type IntegrationAutomationStudioProps = {
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
  view: IntegrationView;
  setView: (view: IntegrationView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: IntegrationView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "channels", label: "Canais" },
    { id: "webhooks", label: "Webhooks" },
    { id: "automations", label: "Automações" },
    { id: "providers", label: "Providers" },
    { id: "sync", label: "Sync" },
    { id: "logs", label: "Logs" },
    { id: "templates", label: "Templates" },
    { id: "security", label: "Segurança" },
    { id: "health", label: "Health" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 027 • Integration & Automation Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Integration Hub</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • canais, webhooks, automações, providers, sync, logs e segurança.
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
            onClick={() => onNavigate?.("tenant-admin")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Admin
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: IntegrationView }) {
  if (view === "channels") return <ChannelsPanel />;
  if (view === "webhooks") return <WebhookPanel />;
  if (view === "automations") return <AutomationsPanel />;
  if (view === "providers") return <ProvidersPanel />;
  if (view === "sync") return <SyncJobsPanel />;
  if (view === "logs") return <IntegrationLogsPanel />;
  if (view === "templates") return <TemplatesPanel />;
  if (view === "security") return <SecurityPanel />;
  if (view === "health") return <HealthPanel />;
  return <IntegrationOverview />;
}

export default function IntegrationAutomationStudio({ arqState, onNavigate }: IntegrationAutomationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<IntegrationView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
