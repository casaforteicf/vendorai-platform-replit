import React from "react";
import { procurementKPIs } from "./procurementAnalyticsData";

export function ProcurementKPIs() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {procurementKPIs.map((kpi) => (
        <article key={kpi.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{kpi.label}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold text-slate-950">{kpi.value}</p>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{kpi.change}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{kpi.description}</p>
        </article>
      ))}
    </section>
  );
}
