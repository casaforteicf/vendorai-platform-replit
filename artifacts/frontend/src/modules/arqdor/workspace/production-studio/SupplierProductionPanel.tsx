import React from "react";
import { suppliers } from "./productionData";

export function SupplierProductionPanel() {
  const statusClass = {
    apto: "bg-emerald-50 text-emerald-700",
    atencao: "bg-amber-50 text-amber-700",
    bloqueado: "bg-rose-50 text-rose-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fornecedores</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Performance de produção</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {suppliers.map((supplier) => (
          <article key={supplier.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{supplier.name}</p>
                <p className="mt-1 text-sm text-slate-500">{supplier.discipline}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[supplier.status]}`}>
                {supplier.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Score</p>
                <p className="mt-1 font-semibold text-slate-800">{supplier.score}%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">OPs</p>
                <p className="mt-1 font-semibold text-slate-800">{supplier.activeOrders}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Atraso médio</p>
              <p className="mt-1 font-semibold text-slate-800">{supplier.avgDelay}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
