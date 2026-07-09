import React from "react";
import { aiActions } from "./aiEnterpriseData";
import { actionStatusClass, priorityClass } from "./aiEnterpriseUtils";

export function AIActionQueue() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fila de ações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Ações sugeridas pela IA</h2>

      <div className="mt-5 space-y-3">
        {aiActions.map((action) => (
          <article key={action.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-950">{action.title}</p>
                <p className="mt-1 text-sm text-slate-500">{action.module} • {action.owner}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(action.priority)}`}>
                  {action.priority}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${actionStatusClass(action.status)}`}>
                  {action.status}
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{action.description}</p>
            <p className="mt-3 text-sm font-semibold text-violet-700">{action.impact}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                Aprovar
              </button>
              <button type="button" className="rounded-2xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
                Ajustar
              </button>
              <button type="button" className="rounded-2xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                Ignorar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
