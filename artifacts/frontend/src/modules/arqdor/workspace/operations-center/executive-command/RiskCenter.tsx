import React from "react";
import { risks } from "./executiveData";
import { riskClass } from "./executiveUtils";

export function RiskCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Risk Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Matriz de riscos executiva</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{risk.title}</p>
                <p className="mt-1 text-sm text-slate-500">{risk.area} • {risk.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(risk.level)}`}>{risk.level}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{risk.mitigation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
