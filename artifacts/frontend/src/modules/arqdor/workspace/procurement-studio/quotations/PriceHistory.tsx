import React from "react";
import { priceHistory } from "./quotationData";
import { currency } from "./quotationUtils";

export function PriceHistory() {
  const max = Math.max(...priceHistory.map((point) => point.value));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Histórico</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Evolução de preço</h2>

      <div className="mt-6 space-y-4">
        {priceHistory.map((point) => (
          <div key={point.month}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">{point.month}</span>
              <span className="text-slate-500">{currency(point.value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${(point.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
