import React from "react";
import { automationRules } from "./procurementAnalyticsData";
import { statusClass } from "./procurementAnalyticsUtils";

export function ProcurementAutomation() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Automações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Regras de compras</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {automationRules.map((rule) => (
          <article key={rule.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{rule.title}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(rule.status)}`}>{rule.status}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Gatilho" value={rule.trigger} />
              <Info label="Ação" value={rule.action} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
