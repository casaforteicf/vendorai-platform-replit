import React from "react";
import { forecast } from "./revenueData";
import { ProbabilityBar } from "./ProbabilityBar";

export function RevenueForecastPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Forecast</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Previsão de receita dos próximos ciclos</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {forecast.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-lg font-semibold text-slate-950">{item.month}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Novo MRR</p>
                <p className="mt-1 font-semibold text-slate-800">{item.newMrr}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Setup</p>
                <p className="mt-1 font-semibold text-slate-800">{item.setupRevenue}</p>
              </div>
            </div>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Risco churn</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{item.churnRisk}</p>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Confiança</span>
                <span>{item.confidence}%</span>
              </div>
              <ProbabilityBar value={item.confidence} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
