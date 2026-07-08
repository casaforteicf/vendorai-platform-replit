import React from "react";
import { manufacturers } from "./specificationData";

export function ManufacturerLibrary() {
  const statusClass = {
    ativo: "bg-emerald-50 text-emerald-700",
    em_breve: "bg-amber-50 text-amber-700",
    revisar: "bg-violet-50 text-violet-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fabricantes</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Bibliotecas oficiais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {manufacturers.map((manufacturer) => (
          <article key={manufacturer.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{manufacturer.name}</p>
                <p className="mt-1 text-sm text-slate-500">{manufacturer.category}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[manufacturer.status]}`}>
                {manufacturer.status === "em_breve" ? "Em breve" : manufacturer.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Score</p>
                <p className="mt-1 font-semibold text-slate-800">{manufacturer.score}%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Produtos</p>
                <p className="mt-1 font-semibold text-slate-800">{manufacturer.products}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
