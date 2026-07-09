import React from "react";
import { copilotActions } from "./copilotData";
import { impactClass, statusClass } from "./copilotUtils";

export function ActionCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Action Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Ações recomendadas e executáveis</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {copilotActions.map((action) => (
          <article key={action.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{action.title}</p>
                <p className="mt-1 text-sm text-slate-500">{action.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${impactClass(action.impact)}`}>{action.impact}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{action.description}</p>

            <div className="mt-5 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(action.status)}`}>{action.status}</span>
              <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                Executar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
