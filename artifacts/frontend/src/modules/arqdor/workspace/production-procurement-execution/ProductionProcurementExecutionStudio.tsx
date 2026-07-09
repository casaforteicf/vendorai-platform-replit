import React, { useMemo, useState } from "react";
import { ExecutionTimelinePanel } from "./ExecutionTimelinePanel";
import { InstallationSchedulePanel } from "./InstallationSchedulePanel";
import { ProductionSummaryCards } from "./ProductionSummaryCards";
import { QualityChecklistPanel } from "./QualityChecklistPanel";
import { SupplierOrdersPanel } from "./SupplierOrdersPanel";
import { WorkOrderEditorPanel } from "./WorkOrderEditorPanel";
import { WorkOrdersBoard } from "./WorkOrdersBoard";
import type { ExecutionView, ProductionStatus } from "./productionTypes";
import { getProjectId, getProjectTitle, getProposalId } from "./productionUtils";
import { useProductionExecution } from "./useProductionExecution";

type ProductionProcurementExecutionStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function ProductionProcurementExecutionStudio({ arqState, onNavigate }: ProductionProcurementExecutionStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const proposalId = useMemo(() => getProposalId(arqState), [arqState]);
  const [view, setView] = useState<ExecutionView>("overview");

  const {
    workOrders,
    supplierOrders,
    installationTasks,
    qualityChecks,
    events,
    selectedOrder,
    setSelectedOrder,
    stats,
    loading,
    generating,
    saving,
    supplierSaving,
    error,
    reload,
    generateFromApproval,
    addOrder,
    saveOrder,
    addSupplierOrder,
    saveSupplierOrder,
  } = useProductionExecution(projectId, proposalId);

  function changeStatus(order: any, status: ProductionStatus) {
    void saveOrder(order.id, { status });
  }

  const nav: Array<{ id: ExecutionView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "orders", label: "Ordens" },
    { id: "suppliers", label: "Compras" },
    { id: "schedule", label: "Agenda" },
    { id: "installation", label: "Instalação" },
    { id: "quality", label: "Qualidade" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Sprint 033 • Production, Procurement & Execution</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Produção, compras e execução</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • aprovação do cliente vira ordens, pedidos de fornecedor, agenda, instalação e qualidade.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {nav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    view === item.id ? "bg-slate-950 text-white" : "bg-[var(--arq-card-soft)] text-[var(--arq-muted)] hover:bg-[var(--arq-card-soft)] hover:text-[var(--arq-accent)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                {loading ? "Carregando..." : "Atualizar"}
              </button>

              <button
                type="button"
                onClick={() => void generateFromApproval()}
                disabled={generating}
                className="rounded-2xl bg-[var(--arq-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {generating ? "Gerando..." : "Gerar da aprovação"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Projeto" value={projectId || "não identificado"} />
            <Info label="Proposta" value={proposalId || "não identificada pelo estado"} />
            <Info label="Ordens" value={String(workOrders.length)} />
          </div>
        </header>

        {error ? (
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        {(view === "overview" || view === "orders") ? (
          <>
            <ProductionSummaryCards stats={stats} />

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <WorkOrdersBoard
                orders={workOrders}
                selectedOrder={selectedOrder}
                onSelect={setSelectedOrder}
                onStatusChange={changeStatus}
              />

              <WorkOrderEditorPanel
                projectId={projectId}
                proposalId={proposalId}
                selectedOrder={selectedOrder}
                saving={saving}
                onCreate={addOrder}
                onSave={saveOrder}
              />
            </div>
          </>
        ) : null}

        {view === "suppliers" ? (
          <SupplierOrdersPanel
            projectId={projectId}
            orders={supplierOrders}
            selectedOrder={selectedOrder}
            saving={supplierSaving}
            onCreate={addSupplierOrder}
            onUpdate={saveSupplierOrder}
          />
        ) : null}

        {view === "schedule" || view === "installation" ? (
          <InstallationSchedulePanel tasks={installationTasks} workOrders={workOrders} />
        ) : null}

        {view === "quality" ? (
          <QualityChecklistPanel checks={qualityChecks} workOrders={workOrders} />
        ) : null}

        {view === "timeline" ? (
          <ExecutionTimelinePanel events={events} />
        ) : null}

        <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Próximo fluxo</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Conclusão → Pós-venda</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--arq-muted)]">
            Quando as ordens estiverem concluídas, o próximo módulo deve iniciar pós-venda, documentação final, fotos, termo de entrega,
            satisfação do cliente e oportunidades futuras.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.("post-sale")}
            className="mt-4 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
          >
            Preparar pós-venda
          </button>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-[var(--arq-card-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--arq-foreground)]">{value}</p>
    </div>
  );
}
