import React from "react";
import { healthChecks } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function HealthPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Health</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde das integrações</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {healthChecks.map((health) => (
          <article key={health.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{health.service}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(health.status)}`}>
                {integrationStatusLabel(health.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Info label="Uptime" value={health.uptime} />
              <Info label="Latência" value={health.latency} />
              <Info label="Erro" value={health.errorRate} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{health.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
