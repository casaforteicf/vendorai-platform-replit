import React from "react";
import { governanceRules } from "./aiEnterpriseData";
import { governanceModeClass } from "./aiEnterpriseUtils";

export function AIGovernancePanel() {
  const riskClass = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-amber-50 text-amber-700",
    alto: "bg-rose-50 text-rose-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Governança</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Regras de segurança, autonomia e aprovação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {governanceRules.map((rule) => (
          <article key={rule.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${governanceModeClass(rule.mode)}`}>{rule.mode}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass[rule.risk]}`}>risco {rule.risk}</span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{rule.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{rule.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
