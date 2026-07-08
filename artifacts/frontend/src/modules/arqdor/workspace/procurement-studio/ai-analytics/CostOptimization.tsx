import React from "react";
import { costOptimizations } from "./procurementAnalyticsData";
import { currency } from "./procurementAnalyticsUtils";

export function CostOptimization() {
  const saving = costOptimizations.reduce((sum, item) => sum + item.saving, 0);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Otimização</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Economias identificadas</h2>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{currency(saving)}</div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {costOptimizations.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{item.title}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Atual" value={currency(item.currentCost)} />
              <Info label="Otimizado" value={currency(item.optimizedCost)} />
              <Info label="Economia" value={currency(item.saving)} />
            </div>
            <button type="button" className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700">{item.action}</button>
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
