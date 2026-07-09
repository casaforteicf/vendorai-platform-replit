import React from "react";
import { partners } from "./revenueData";
import { priorityClass, revenueStatusClass, revenueStatusLabel } from "./revenueUtils";

export function PartnerRevenuePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Parcerias</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Receita por fornecedores, lojas e representantes</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {partners.map((partner) => (
          <article key={partner.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(partner.priority)}`}>
                {partner.priority}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${revenueStatusClass(partner.status)}`}>
                {revenueStatusLabel(partner.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{partner.name}</p>
            <p className="mt-1 text-sm text-slate-500">{partner.type}</p>

            <div className="mt-4 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Oportunidade</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{partner.opportunity}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Modelo</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{partner.model}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
