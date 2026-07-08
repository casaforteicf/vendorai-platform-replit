import React from "react";
import { financialItems } from "./clientExperienceData";
import { currency, financialClass, formatDate } from "./clientExperienceUtils";

export function FinancialPanel() {
  const total = financialItems.reduce((sum, item) => sum + item.amount, 0);
  const paid = financialItems.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Financeiro</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Pagamentos e parcelas</h2>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{currency(paid)} / {currency(total)}</div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {financialItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDate(item.dueDate)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${financialClass(item.status)}`}>{item.status}</span>
            </div>
            <p className="mt-5 text-2xl font-semibold text-slate-950">{currency(item.amount)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
