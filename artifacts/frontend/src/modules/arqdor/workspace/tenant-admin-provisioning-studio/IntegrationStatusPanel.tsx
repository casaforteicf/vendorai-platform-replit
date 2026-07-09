import React from "react";
import { integrations } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function IntegrationStatusPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Integrações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Canais, provedores e sincronização</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => (
          <article key={integration.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{integration.channel}</p>
                <p className="mt-1 text-sm text-slate-500">{integration.tenant}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(integration.status)}`}>
                {adminStatusLabel(integration.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Provider</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{integration.provider}</p>
              <p className="mt-1 text-xs text-slate-500">Última sync: {integration.lastSync}</p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{integration.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
