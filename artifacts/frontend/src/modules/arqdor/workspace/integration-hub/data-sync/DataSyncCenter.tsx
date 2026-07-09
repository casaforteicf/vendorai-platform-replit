import React, { useState } from "react";
import { AIDataSyncPanel } from "./AIDataSyncPanel";
import { APIConnectorManager } from "./APIConnectorManager";
import { ConflictResolver } from "./ConflictResolver";
import { DataMappingPanel } from "./DataMappingPanel";
import { DataSourcePanel } from "./DataSourcePanel";
import { DataSyncDashboard } from "./DataSyncDashboard";
import { EventBusCenter } from "./EventBusCenter";
import { SchemaContractPanel } from "./SchemaContractPanel";
import { SyncJobMonitor } from "./SyncJobMonitor";
import { SyncLogPanel } from "./SyncLogPanel";
import type { DataSyncView } from "./dataSyncTypes";

type Props = {
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: DataSyncView; setView: (view: DataSyncView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: DataSyncView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sources", label: "Fontes" },
    { id: "apis", label: "APIs" },
    { id: "eventbus", label: "Event Bus" },
    { id: "schemas", label: "Schemas" },
    { id: "mappings", label: "Mappings" },
    { id: "jobs", label: "Jobs" },
    { id: "conflicts", label: "Conflitos" },
    { id: "logs", label: "Logs" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 017B — Data Sync + API + Event Bus</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Data Sync Center</h1>
          <p className="mt-1 text-sm text-slate-500">Fontes de dados, APIs, Event Bus, contratos, mapeamentos, jobs, conflitos e logs.</p>
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

export default function DataSyncCenter({ onNavigate }: Props) {
  const [view, setView] = useState<DataSyncView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <DataSyncDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <DataSourcePanel />
                <EventBusCenter />
                <ConflictResolver />
              </div>
              <AIDataSyncPanel />
            </main>
          </>
        ) : null}

        {view === "sources" ? <DataSourcePanel /> : null}
        {view === "apis" ? <APIConnectorManager /> : null}
        {view === "eventbus" ? <EventBusCenter /> : null}
        {view === "schemas" ? <SchemaContractPanel /> : null}
        {view === "mappings" ? <DataMappingPanel /> : null}
        {view === "jobs" ? <SyncJobMonitor /> : null}
        {view === "conflicts" ? <ConflictResolver /> : null}
        {view === "logs" ? <SyncLogPanel /> : null}
        {view === "ai" ? <AIDataSyncPanel /> : null}
      </div>
    </div>
  );
}
