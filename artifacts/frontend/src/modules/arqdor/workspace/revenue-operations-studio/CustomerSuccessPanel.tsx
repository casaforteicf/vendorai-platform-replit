import React from "react";
import { successAccounts } from "./revenueData";
import { ProbabilityBar } from "./ProbabilityBar";
import { revenueStatusClass, revenueStatusLabel } from "./revenueUtils";

export function CustomerSuccessPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Customer Success</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde, adoção e expansão</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {successAccounts.map((account) => (
          <article key={account.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{account.company}</p>
                <p className="mt-1 text-sm text-slate-500">{account.plan}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${revenueStatusClass(account.status)}`}>
                {revenueStatusLabel(account.status)}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>Health</span>
                  <span>{account.health}%</span>
                </div>
                <ProbabilityBar value={account.health} />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>Adoção</span>
                  <span>{account.adoption}%</span>
                </div>
                <ProbabilityBar value={account.adoption} />
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risco</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{account.risk}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Expansão</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{account.expansion}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
