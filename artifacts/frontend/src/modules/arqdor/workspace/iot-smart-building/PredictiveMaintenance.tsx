import React from "react";
import { maintenancePredictions } from "./iotData";
import { severityClass } from "./iotUtils";

export function PredictiveMaintenance() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Manutenção preditiva</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Previsões de falha</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {maintenancePredictions.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.device}</p>
                <p className="mt-1 text-sm text-slate-500">{item.location}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(item.severity)}`}>{item.severity}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{item.predictedIssue}</p>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Probabilidade</span>
                <span className="text-slate-400">{item.probability}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${item.probability}%` }} />
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400">Prazo estimado: {item.dueIn}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
