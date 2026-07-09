import React from "react";
import { riskItems } from "./pilotData";
import { pilotStatusClass, pilotStatusLabel, severityClass } from "./pilotUtils";

export function PilotRisksPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Riscos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Riscos, bloqueios e mitigação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {riskItems.map((risk) => (
          <article key={risk.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(risk.severity)}`}>{risk.severity}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(risk.status)}`}>
                {pilotStatusLabel(risk.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{risk.title}</p>
            <p className="mt-1 text-sm text-slate-500">{risk.account}</p>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mitigação</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{risk.mitigation}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
