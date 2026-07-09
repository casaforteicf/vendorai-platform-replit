import React from "react";
import { workflowSteps } from "./aiEnterpriseData";
import { workflowStatusClass } from "./aiEnterpriseUtils";

export function AIWorkflowMap() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fluxo Inteligente</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Render → Especificação → Orçamento → Produção → Cliente</h2>

      <div className="mt-8 grid gap-4 xl:grid-cols-5">
        {workflowSteps.map((step, index) => (
          <article key={step.id} className="relative rounded-[28px] border border-slate-100 bg-slate-50 p-5">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold ${workflowStatusClass(step.status)}`}>
              {index + 1}
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{step.label}</p>
            <p className="mt-1 text-sm text-slate-500">{step.module} • {step.agent}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{step.insight}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
