import React from "react";
import { risks } from "./mockApiInventoryData";
import { priorityClass } from "./mockApiInventoryUtils";

export function InventoryRisksPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Riscos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Riscos da remoção de mocks</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{risk.title}</p>
                <p className="mt-1 text-sm text-slate-500">{risk.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(risk.risk)}`}>{risk.risk}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{risk.impact}</p>
            <div className="mt-4 rounded-2xl bg-violet-50 p-3">
              <p className="text-xs font-semibold text-violet-700">Mitigação</p>
              <p className="mt-1 text-xs text-violet-700">{risk.mitigation}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
