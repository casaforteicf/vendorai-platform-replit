import React from "react";
import { launchSteps } from "./releaseData";
import { releaseStatusClass, releaseStatusLabel } from "./releaseUtils";

export function LaunchPlanPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Lançamento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Plano de rollout do ARQDOR.ai</h2>

      <div className="mt-8 grid gap-4 xl:grid-cols-5">
        {launchSteps.map((step, index) => (
          <article key={step.id} className="rounded-[28px] border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${releaseStatusClass(step.status)}`}>
                {releaseStatusLabel(step.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{step.title}</p>
            <p className="mt-1 text-sm text-slate-500">{step.date} • {step.owner}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
