import React from "react";
import { integrations } from "./releaseData";
import { ReadinessBar } from "./ReadinessBar";
import { releaseStatusClass, releaseStatusLabel } from "./releaseUtils";

export function IntegrationAuditPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Integrações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Auditoria de endpoints e cobertura</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <article key={integration.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{integration.name}</p>
                <p className="mt-1 text-sm font-mono text-slate-400">{integration.endpoint}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${releaseStatusClass(integration.status)}`}>
                {releaseStatusLabel(integration.status)}
              </span>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Cobertura</span>
                <span>{integration.coverage}%</span>
              </div>
              <ReadinessBar value={integration.coverage} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{integration.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
