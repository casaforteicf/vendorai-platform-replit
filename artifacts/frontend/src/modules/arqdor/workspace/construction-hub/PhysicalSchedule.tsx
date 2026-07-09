import React from "react";
import { phases } from "./constructionData";
import { formatDate, statusClass } from "./constructionUtils";

export function PhysicalSchedule() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cronograma físico</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fases de execução</h2>

      <div className="mt-6 space-y-5">
        {phases.map((phase) => (
          <div key={phase.id}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800">{phase.title} • {phase.discipline}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(phase.status)}`}>{phase.status}</span>
            </div>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{formatDate(phase.startDate)} → {formatDate(phase.endDate)}</span>
              <span>{phase.progress}% • {phase.responsible}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${phase.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
