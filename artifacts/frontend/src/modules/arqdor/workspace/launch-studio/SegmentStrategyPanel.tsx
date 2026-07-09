import React from "react";
import { marketSegments } from "./launchData";
import { priorityClass } from "./launchUtils";

export function SegmentStrategyPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Segmentos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">ICP, dor, promessa e abordagem</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {marketSegments.map((segment) => (
          <article key={segment.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{segment.name}</p>
                <p className="mt-1 text-sm text-slate-500">{segment.offer}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(segment.priority)}`}>
                {segment.priority}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Perfil</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{segment.profile}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Dor</p>
              <p className="mt-1 text-sm leading-6 text-rose-900">{segment.pain}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pitch</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{segment.pitch}</p>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Pronto para venda</span>
                <span>{segment.readiness}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-950" style={{ width: `${segment.readiness}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
