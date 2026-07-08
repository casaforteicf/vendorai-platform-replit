import React, { useMemo, useState } from "react";
import { AIProcurementPanel } from "./AIProcurementPanel";
import { ProcurementDashboard } from "./ProcurementDashboard";
import { ProcurementSuppliers } from "./ProcurementSuppliers";
import Quotations from "./quotations/Quotations";
import { PurchaseRequestInspector } from "./PurchaseRequestInspector";
import { purchaseRequests } from "./procurementData";
import type { ProcurementView, PurchaseRequest } from "./procurementTypes";
import { clientName, getProject, projectTitle } from "./procurementUtils";

type ProcurementStudioProps = {
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
  view: ProcurementView;
  setView: (view: ProcurementView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: ProcurementView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "requests", label: "Solicitações" },
    { id: "quotations", label: "Cotações" },
    { id: "orders", label: "Pedidos" },
    { id: "receiving", label: "Recebimento" },
    { id: "inventory", label: "Estoque" },
    { id: "logistics", label: "Logística" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Procurement Studio Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{projectTitle(project)}</h1>
          <p className="mt-1 text-sm text-slate-500">{clientName(project)} • Orçamento → Compras → Recebimento → Produção</p>
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

          <button type="button" onClick={() => onNavigate?.("budget")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Orçamento
          </button>
        </div>
      </div>
    </header>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-10 text-center shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">Este painel será expandido nos próximos pacotes da Sprint 012.</p>
    </section>
  );
}

function Content({
  view,
  selectedRequest,
  setSelectedRequest,
  onNavigate,
}: {
  view: ProcurementView;
  selectedRequest: PurchaseRequest;
  setSelectedRequest: (request: PurchaseRequest) => void;
  onNavigate?: (module: string) => void;
}) {
  if (view === "requests") {
    return (
      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <ProcurementDashboard selectedRequest={selectedRequest} setSelectedRequest={setSelectedRequest} />
        <PurchaseRequestInspector request={selectedRequest} />
      </div>
    );
  }

  if (view === "quotations") return <Quotations onNavigate={onNavigate} />;
  if (view === "orders") return <Placeholder title="Pedidos de compra" />;
  if (view === "receiving") return <Placeholder title="Recebimento" />;
  if (view === "inventory") return <Placeholder title="Estoque" />;
  if (view === "logistics") return <Placeholder title="Logística" />;
  if (view === "ai") return <AIProcurementPanel />;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <ProcurementDashboard selectedRequest={selectedRequest} setSelectedRequest={setSelectedRequest} />
      <div className="space-y-5">
        <PurchaseRequestInspector request={selectedRequest} />
        <AIProcurementPanel />
      </div>
    </div>
  );
}

export default function ProcurementStudio({ arqState, onNavigate }: ProcurementStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<ProcurementView>("dashboard");
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest>(purchaseRequests[0]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} selectedRequest={selectedRequest} setSelectedRequest={setSelectedRequest} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
