import React from "react";
import { apiConnectors } from "./dataSyncData";
import { statusClass } from "./dataSyncUtils";

export function APIConnectorManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">API Connectors</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Conectores de API</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {apiConnectors.map((api) => (
          <article key={api.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{api.name}</p>
                <p className="mt-1 text-sm text-slate-500">{api.module} • {api.auth}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(api.status)}`}>{api.status}</span>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">{api.basePath}</span>
                <span className="text-slate-400">{api.coverage}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${api.coverage}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
