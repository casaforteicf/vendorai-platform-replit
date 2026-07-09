import React from "react";
import { dunning } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function DunningPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cobrança</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Régua de cobrança e recuperação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {dunning.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.company}</p>
                <p className="mt-1 text-sm text-slate-500">{item.invoice} • {item.daysOverdue} dias vencido</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(item.status)}`}>
                {billingStatusLabel(item.status)}
              </span>
            </div>

            <p className="mt-5 text-3xl font-semibold text-slate-950">{item.amount}</p>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Ação recomendada</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{item.action}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
