import React from "react";
import { warranties } from "./facilityData";
import { formatDate, statusClass } from "./facilityUtils";

export function WarrantyCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Garantias</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Controle de garantias</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {warranties.map((warranty) => (
          <article key={warranty.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{warranty.title}</p>
                <p className="mt-1 text-sm text-slate-500">{warranty.supplier}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(warranty.status)}`}>{warranty.status}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500">{warranty.asset}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDate(warranty.startDate)} → {formatDate(warranty.endDate)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
