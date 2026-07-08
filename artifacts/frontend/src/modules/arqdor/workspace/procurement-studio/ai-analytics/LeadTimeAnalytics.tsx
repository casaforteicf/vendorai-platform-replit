import React from "react";
import { supplierPerformance } from "./procurementAnalyticsData";

export function LeadTimeAnalytics() {
  const max = Math.max(...supplierPerformance.map((supplier) => supplier.avgLeadTime));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Lead Time</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Prazos por fornecedor</h2>

      <div className="mt-6 space-y-4">
        {supplierPerformance.map((supplier) => (
          <div key={supplier.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">{supplier.name}</span>
              <span className="text-slate-500">{supplier.avgLeadTime} dias</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${(supplier.avgLeadTime / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
