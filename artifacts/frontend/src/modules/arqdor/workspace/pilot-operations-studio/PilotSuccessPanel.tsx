import React from "react";
import { successMetrics } from "./pilotData";
import { pilotStatusClass, pilotStatusLabel } from "./pilotUtils";

export function PilotSuccessPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Success</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Métricas de sucesso dos pilotos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {successMetrics.map((metric) => (
          <article key={metric.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{metric.label}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(metric.status)}`}>
                {pilotStatusLabel(metric.status)}
              </span>
            </div>

            <p className="mt-4 text-3xl font-semibold text-slate-950">{metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">Meta: {metric.target}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{metric.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
