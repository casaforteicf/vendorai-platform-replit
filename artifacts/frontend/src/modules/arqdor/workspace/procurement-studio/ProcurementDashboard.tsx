import React from "react";
import { MetricCard } from "./MetricCard";
import { PurchaseRequestCard } from "./PurchaseRequestCard";
import { purchaseRequests } from "./procurementData";
import type { PurchaseRequest } from "./procurementTypes";
import { currency } from "./procurementUtils";

export function ProcurementDashboard({ selectedRequest, setSelectedRequest }: { selectedRequest: PurchaseRequest; setSelectedRequest: (request: PurchaseRequest) => void }) {
  const totalValue = purchaseRequests.reduce((sum, request) => sum + request.estimatedValue, 0);
  const pending = purchaseRequests.filter((request) => request.status === "pending").length;
  const approved = purchaseRequests.filter((request) => request.status === "approved").length;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Solicitações" value={String(purchaseRequests.length)} description="Demandas abertas para compras." />
        <MetricCard label="Valor estimado" value={currency(totalValue)} description="Volume previsto em compras." />
        <MetricCard label="Pendentes" value={String(pending)} description="Aguardando cotação/aprovação." />
        <MetricCard label="Aprovadas" value={String(approved)} description="Prontas para pedido." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compras ativas</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Solicitações de compra</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {purchaseRequests.map((request) => (
            <PurchaseRequestCard key={request.id} request={request} selected={selectedRequest.id === request.id} onSelect={setSelectedRequest} />
          ))}
        </div>
      </section>
    </div>
  );
}
