import React from "react";
import { handoffs } from "./integrationData";
import { workflowStatusClass } from "./integrationUtils";

export function HandoffManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Handoff Manager</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Passagem de dados entre módulos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {handoffs.map((handoff) => (
          <article key={handoff.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{handoff.from} → {handoff.to}</p>
                <p className="mt-1 text-sm text-slate-500">{handoff.payload}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${workflowStatusClass(handoff.status)}`}>{handoff.status}</span>
            </div>

            {handoff.blocker ? (
              <div className="mt-4 rounded-2xl bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-700">Bloqueio</p>
                <p className="mt-1 text-xs text-rose-700">{handoff.blocker}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
