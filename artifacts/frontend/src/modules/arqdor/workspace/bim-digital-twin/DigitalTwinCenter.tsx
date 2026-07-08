import React, { useState } from "react";
import { BIMHub } from "./BIMHub";
import { BIMInsights } from "./BIMInsights";
import { ClashDetection } from "./ClashDetection";
import { ExportCenter } from "./ExportCenter";
import { IFCViewer } from "./IFCViewer";
import { MetricCard } from "./MetricCard";
import { ModelComparison } from "./ModelComparison";
import { ModelExplorer } from "./ModelExplorer";
import { ModelProperties } from "./ModelProperties";
import { VersionManager } from "./VersionManager";
import { clashes, elements, models } from "./bimData";
import type { BIMView } from "./bimTypes";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: BIMView; setView: (view: BIMView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: BIMView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "viewer", label: "Viewer" },
    { id: "explorer", label: "Explorer" },
    { id: "clashes", label: "Clashes" },
    { id: "versions", label: "Versões" },
    { id: "comparison", label: "Comparar" },
    { id: "properties", label: "Propriedades" },
    { id: "exports", label: "Export" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">BIM & Digital Twin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Digital Twin Center</h1>
          <p className="mt-1 text-sm text-slate-500">IFC, modelo 3D, compatibilização, versões, propriedades e exportação.</p>
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

export default function DigitalTwinCenter({ onNavigate }: Props) {
  const [view, setView] = useState<BIMView>("dashboard");

  const totalElements = models.reduce((sum, model) => sum + model.elements, 0);
  const openClashes = clashes.filter((item) => item.status !== "resolved").length;
  const riskyElements = elements.filter((item) => item.status === "clash" || item.status === "warning").length;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Modelos" value={String(models.length)} description="Modelos BIM conectados." />
              <MetricCard label="Elementos" value={String(totalElements)} description="Elementos rastreados." />
              <MetricCard label="Clashes" value={String(openClashes)} description="Conflitos em aberto/revisão." />
              <MetricCard label="Elementos críticos" value={String(riskyElements)} description="Itens com aviso ou conflito." />
            </section>

            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <IFCViewer />
                <BIMHub />
                <ClashDetection />
              </div>
              <BIMInsights />
            </main>
          </>
        ) : null}

        {view === "viewer" ? <IFCViewer /> : null}
        {view === "explorer" ? <ModelExplorer /> : null}
        {view === "clashes" ? <ClashDetection /> : null}
        {view === "versions" ? <VersionManager /> : null}
        {view === "comparison" ? <ModelComparison /> : null}
        {view === "properties" ? <ModelProperties /> : null}
        {view === "exports" ? <ExportCenter /> : null}
        {view === "ai" ? <BIMInsights /> : null}
      </div>
    </div>
  );
}
