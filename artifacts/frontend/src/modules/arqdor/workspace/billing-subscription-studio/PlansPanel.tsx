import React from "react";
import { billingPlans } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function PlansPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Planos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Planos, implantação e limites comerciais</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-4">
        {billingPlans.map((plan) => (
          <article key={plan.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-950">ARQDOR {plan.name}</p>
                <p className="mt-1 text-sm text-slate-500">{plan.target}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(plan.status)}`}>
                {billingStatusLabel(plan.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">Mensalidade</p>
              <p className="mt-1 text-3xl font-semibold">{plan.monthly}</p>
              <p className="mt-3 text-sm text-slate-300">Implantação: {plan.setup}</p>
            </div>

            <div className="mt-5 space-y-2">
              {plan.limits.map((limit) => (
                <div key={limit} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  {limit}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
