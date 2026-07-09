import React from "react";
import { securityChecks } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel, severityClass } from "./integrationUtils";

export function SecurityPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Segurança</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Checklist de segurança das integrações</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {securityChecks.map((check) => (
          <article key={check.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(check.severity)}`}>
                {check.severity}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(check.status)}`}>
                {integrationStatusLabel(check.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{check.title}</p>
            <p className="mt-1 text-sm text-slate-500">{check.scope}</p>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Recomendação</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{check.recommendation}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
