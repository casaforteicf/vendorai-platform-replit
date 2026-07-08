import React from "react";
import { predictiveItems } from "./executiveData";
import { riskClass } from "./executiveUtils";

export function PredictiveAnalytics() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">IA Preditiva</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Previsões operacionais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {predictiveItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{item.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(item.impact)}`}>{item.impact}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{item.prediction}</p>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Probabilidade</span>
                <span className="text-slate-400">{item.probability}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${item.probability}%` }} />
              </div>
            </div>

            <button type="button" className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700">
              {item.recommendation}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
