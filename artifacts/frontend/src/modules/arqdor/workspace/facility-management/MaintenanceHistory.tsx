import React from "react";
import { maintenanceItems } from "./facilityData";
import { formatDate, priorityClass } from "./facilityUtils";

export function MaintenanceHistory() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Manutenção</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Manutenções preventivas</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {maintenanceItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{item.asset}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500">{item.frequency} • {item.owner}</p>
            <p className="mt-2 text-xs text-slate-400">Próxima: {formatDate(item.nextDate)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
