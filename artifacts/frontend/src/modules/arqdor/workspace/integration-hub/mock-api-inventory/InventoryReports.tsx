import React from "react";
import { apiInventory, mockFiles, risks } from "./mockApiInventoryData";
import { MetricCard } from "./MetricCard";

export function InventoryReports() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Mocks" value={String(mockFiles.length)} description="Arquivos inventariados." />
        <MetricCard label="APIs" value={String(apiInventory.length)} description="Endpoints mapeados." />
        <MetricCard label="Riscos" value={String(risks.length)} description="Riscos identificados." />
        <MetricCard label="Próxima" value="019B" description="Specification + Budget real." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório 019A</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Mock → API Inventory Summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Inventário consolidado dos mocks, APIs, contratos de dados, riscos e ordem segura de migração.
        </p>
      </section>
    </div>
  );
}
