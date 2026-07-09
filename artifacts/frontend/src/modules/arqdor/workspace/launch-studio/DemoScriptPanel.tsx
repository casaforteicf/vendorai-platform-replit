import React from "react";
import { demoSteps } from "./launchData";
import { launchStatusClass, launchStatusLabel } from "./launchUtils";

export function DemoScriptPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Demo</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Roteiro comercial de demonstração</h2>

      <div className="mt-8 grid gap-4 xl:grid-cols-6">
        {demoSteps.map((step, index) => (
          <article key={step.id} className="rounded-[28px] border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${launchStatusClass(step.status)}`}>
                {launchStatusLabel(step.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{step.title}</p>
            <p className="mt-1 text-sm text-slate-500">{step.module} • {step.duration}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{step.objective}</p>

            <div className="mt-4 rounded-3xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fala-chave</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{step.talkingPoint}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
