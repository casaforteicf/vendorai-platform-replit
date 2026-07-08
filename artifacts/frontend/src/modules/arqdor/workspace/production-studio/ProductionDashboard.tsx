import React from "react";
import { MetricCard } from "./MetricCard";
import { WorkOrderCard } from "./WorkOrderCard";
import { workOrders } from "./productionData";
import type { WorkOrder } from "./productionTypes";

export function ProductionDashboard({ selectedOrder, setSelectedOrder }: { selectedOrder: WorkOrder; setSelectedOrder: (order: WorkOrder) => void }) {
  const active = workOrders.filter((order) => order.status !== "finalizado").length;
  const average = Math.round(workOrders.reduce((sum, order) => sum + order.progress, 0) / workOrders.length);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="OPs ativas" value={String(active)} description="Ordens em andamento." />
        <MetricCard label="Progresso médio" value={`${average}%`} description="Média das frentes de produção." />
        <MetricCard label="Fornecedores" value="4" description="Base ativa de execução." />
        <MetricCard label="Alertas IA" value="3" description="Riscos e gargalos detectados." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Produção ativa</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Ordens de Produção</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {workOrders.map((order) => (
            <WorkOrderCard key={order.id} order={order} selected={selectedOrder.id === order.id} onSelect={setSelectedOrder} />
          ))}
        </div>
      </section>
    </div>
  );
}
