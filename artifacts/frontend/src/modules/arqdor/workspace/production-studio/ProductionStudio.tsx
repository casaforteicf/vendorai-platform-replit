import React, { useMemo, useState } from "react";
import { AIProductionPanel } from "./AIProductionPanel";
import { GanttTimeline } from "./GanttTimeline";
import { InstallationPanel } from "./InstallationPanel";
import { ProductionDashboard } from "./ProductionDashboard";
import { ProductionPipeline } from "./ProductionPipeline";
import { QualityChecklist } from "./QualityChecklist";
import { SupplierProductionPanel } from "./SupplierProductionPanel";
import { WorkOrderPanel } from "./WorkOrderPanel";
import { workOrders } from "./productionData";
import type { ProductionView, WorkOrder } from "./productionTypes";
import { clientName, getProject, projectTitle } from "./productionUtils";

type ProductionStudioProps = {
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
  view: ProductionView;
  setView: (view: ProductionView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: ProductionView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "orders", label: "OPs" },
    { id: "pipeline", label: "Pipeline" },
    { id: "timeline", label: "Cronograma" },
    { id: "quality", label: "Qualidade" },
    { id: "installation", label: "Instalação" },
    { id: "suppliers", label: "Fornecedores" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Production Studio Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{projectTitle(project)}</h1>
          <p className="mt-1 text-sm text-slate-500">{clientName(project)} • Especificação → OP → Produção → Qualidade → Instalação</p>
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
            onClick={() => onNavigate?.("specification")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Especificações
          </button>
        </div>
      </div>
    </header>
  );
}

function OrdersView({ selectedOrder, setSelectedOrder }: { selectedOrder: WorkOrder; setSelectedOrder: (order: WorkOrder) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <ProductionDashboard selectedOrder={selectedOrder} setSelectedOrder={setSelectedOrder} />
      <WorkOrderPanel order={selectedOrder} />
    </div>
  );
}

function Content({
  view,
  selectedOrder,
  setSelectedOrder,
}: {
  view: ProductionView;
  selectedOrder: WorkOrder;
  setSelectedOrder: (order: WorkOrder) => void;
}) {
  if (view === "orders") return <OrdersView selectedOrder={selectedOrder} setSelectedOrder={setSelectedOrder} />;
  if (view === "pipeline") return <ProductionPipeline />;
  if (view === "timeline") return <GanttTimeline />;
  if (view === "quality") return <QualityChecklist />;
  if (view === "installation") return <InstallationPanel />;
  if (view === "suppliers") return <SupplierProductionPanel />;
  if (view === "ai") return <AIProductionPanel />;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <ProductionDashboard selectedOrder={selectedOrder} setSelectedOrder={setSelectedOrder} />
      <div className="space-y-5">
        <WorkOrderPanel order={selectedOrder} />
        <AIProductionPanel />
      </div>
    </div>
  );
}

export default function ProductionStudio({ arqState, onNavigate }: ProductionStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<ProductionView>("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder>(workOrders[0]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} selectedOrder={selectedOrder} setSelectedOrder={setSelectedOrder} />
      </div>
    </div>
  );
}
