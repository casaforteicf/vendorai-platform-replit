import React from "react";
import { decisions } from "./aiCommandData";
import { impactClass, statusClass } from "./aiCommandUtils";

export function AIDecisionBoard() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Decision Board</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Decisões recomendadas pela IA</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {decisions.map((decision) => (
          <article key={decision.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{decision.title}</p>
                <p className="mt-1 text-sm text-slate-500">{decision.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${impactClass(decision.impact)}`}>{decision.impact}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{decision.recommendation}</p>

            <div className="mt-5 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(decision.status)}`}>{decision.status}</span>
              <span className="text-sm font-semibold text-slate-700">{decision.confidence}% confiança</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
