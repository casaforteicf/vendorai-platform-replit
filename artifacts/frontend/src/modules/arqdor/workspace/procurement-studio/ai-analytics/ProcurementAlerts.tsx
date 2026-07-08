import React from "react";
import { riskItems } from "./procurementAnalyticsData";
import { riskClass } from "./procurementAnalyticsUtils";

export function ProcurementAlerts() {
  return (
    <aside className="rounded-[34px] border border-rose-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Alertas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens críticos</h2>

      <div className="mt-5 space-y-3">
        {riskItems.slice(0, 3).map((risk) => (
          <div key={risk.id} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{risk.title}</p>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${riskClass(risk.level)}`}>{risk.level}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{risk.description}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
