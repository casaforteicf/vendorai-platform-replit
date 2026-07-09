import React from "react";
import { moduleReadiness } from "./releaseData";
import { ReadinessBar } from "./ReadinessBar";
import { releaseStatusClass, releaseStatusLabel, severityClass } from "./releaseUtils";

export function ModuleReadinessPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Módulos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Readiness por módulo do ARQDOR.ai</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {moduleReadiness.map((module) => (
          <article key={module.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{module.name}</p>
                <p className="mt-1 text-sm text-slate-500">{module.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${releaseStatusClass(module.status)}`}>
                {releaseStatusLabel(module.status)}
              </span>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Progresso</span>
                <span>{module.progress}%</span>
              </div>
              <ReadinessBar value={module.progress} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Mini label="UI" value={module.ui} />
              <Mini label="Dados" value={module.data} />
              <Mini label="Integração" value={module.integration} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{module.summary}</p>

            <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${severityClass(module.risk)}`}>
              risco {module.risk}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}%</p>
    </div>
  );
}
