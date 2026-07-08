import React from "react";
import { supplierPerformance } from "./procurementAnalyticsData";
import { currency, percent, riskClass } from "./procurementAnalyticsUtils";

export function SupplierPerformance() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Performance</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fornecedores</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {supplierPerformance.map((supplier) => (
          <article key={supplier.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{supplier.name}</p>
                <p className="mt-1 text-sm text-slate-500">{supplier.category}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(supplier.risk)}`}>{supplier.risk}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Score" value={percent(supplier.score)} />
              <Info label="No prazo" value={percent(supplier.onTimeRate)} />
              <Info label="Lead time" value={`${supplier.avgLeadTime} dias`} />
              <Info label="Comprado" value={currency(supplier.totalPurchased)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
