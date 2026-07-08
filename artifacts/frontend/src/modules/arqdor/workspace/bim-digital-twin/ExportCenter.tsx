import React from "react";
import { exportJobs } from "./bimData";
import { statusClass } from "./bimUtils";

export function ExportCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Export Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Exportações IFC / GLB / USDZ / PDF</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {exportJobs.map((job) => (
          <article key={job.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{job.name}</p>
                <p className="mt-1 text-sm text-slate-500">{job.format} • {job.size}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(job.status)}`}>{job.status}</span>
            </div>
            <p className="mt-4 text-xs text-slate-400">{job.createdAt}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
