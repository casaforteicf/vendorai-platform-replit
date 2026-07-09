import React from "react";
import { syncJobs } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function SyncJobsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sincronização</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Jobs de sincronização entre módulos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {syncJobs.map((job) => (
          <article key={job.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{job.name}</p>
                <p className="mt-1 text-sm text-slate-500">{job.frequency}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(job.status)}`}>
                {integrationStatusLabel(job.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Origem" value={job.source} />
              <Info label="Destino" value={job.destination} />
              <Info label="Última sync" value={job.lastSync} />
              <Info label="Registros" value={String(job.records)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
