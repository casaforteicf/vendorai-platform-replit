import React from "react";
import { forecastItems } from "./procurementAnalyticsData";
import { currency } from "./procurementAnalyticsUtils";

export function ProcurementForecast() {
  const max = Math.max(...forecastItems.map((item) => item.expectedSpend));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Forecast</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Previsão de compras</h2>

      <div className="mt-6 space-y-4">
        {forecastItems.map((item) => (
          <div key={item.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">{item.month}</span>
              <span className="text-slate-500">{currency(item.expectedSpend)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${(item.expectedSpend / max) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Confirmado {currency(item.confirmedSpend)} • Risco {currency(item.riskSpend)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
